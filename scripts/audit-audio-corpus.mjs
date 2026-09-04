#!/usr/bin/env node
/**
 * Offline audit of the whole audio corpus (rl-2v0, epic rl-74x).
 *
 * The device suite samples one recording. This script measures all of them:
 * every park's every recording, both asset families, 408 files over the CDN.
 * Per file it decodes to f32le and reports, per channel: RMS, peak, DC
 * offset, exact-zero (digitally silent) sample count, full-scale/overshoot
 * counts, and whether the channel is sample-for-sample identical to another
 * channel (rolling sha256 over the deinterleaved stream — exact, not a
 * threshold). Per recording it checks the pair the app loads together:
 * sample rate and decoded length must agree exactly, which is what
 * mergeBuffersByChannel throws on. Across families it compares levels, so a
 * re-encode that drifts shows up against the lossless masters.
 *
 * Plain node, no dependencies beyond ffmpeg on PATH. The stream report is
 * parsed from ffmpeg's own input description because ffprobe is not shipped
 * by every ffmpeg distribution (the evermeet mac build is ffmpeg-only).
 * Downloads cache in a temp dir, so re-running after a re-encode only pays
 * for changed files. This is an audit, not a gate: it reports and exits 0
 * unless something hard failed (download, decode, or a within-family pair
 * disagreeing on rate or length — the P1 condition).
 *
 * Usage:
 *   node scripts/audit-audio-corpus.mjs [--limit N] [--family aac|lossless]
 *        [--cache-dir DIR] [--out FILE] [--refresh] [--concurrency N]
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CDN_BASE = "https://resonant-landscapes.b-cdn.net/";
const stateParksPath = fileURLToPath(new URL("../src/data/stateParks.json", import.meta.url));
const args = process.argv.slice(2);

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}
function argFlag(flag) {
  return args.includes(flag);
}

const LIMIT = Number(argValue("--limit", 0)) || Infinity;
const FAMILY_FILTER = argValue("--family", null);
const CACHE_DIR = resolve(argValue("--cache-dir", join(tmpdir(), "rl-audio-corpus-cache")));
const OUT_PATH = argValue("--out", null);
const REFRESH = argFlag("--refresh");
const CONCURRENCY = Number(argValue("--concurrency", 4)) || 4;

/**
 * Mirrors formatParkSlug + the family folders in src/utils/audioPaths.ts.
 * Kept local so this script runs under plain node; the download step fails
 * loudly on a 404 if the two ever drift.
 */
const PARK_SLUG_OVERRIDES = {
  "Custer State Park": "Custer-State",
  "Palisades State Park": "Palisades-State",
};

function formatParkSlug(parkName) {
  if (PARK_SLUG_OVERRIDES[parkName]) return PARK_SLUG_OVERRIDES[parkName];
  return parkName
    .replace(/\b(State Park|Historic State Park)\b/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("-");
}

function recordingUrls(slug, recording, section) {
  const paddedSection = String(section).padStart(3, "0");
  const base = `${slug}-${recording}-${paddedSection}`;
  return {
    aac: {
      eightChannel: `${CDN_BASE}sounds/${base}_8ch.m4a`,
      mono: `${CDN_BASE}sounds/${base}_mono.m4a`,
    },
    lossless: {
      eightChannel: `${CDN_BASE}sounds-flac/${base}_8ch.flac`,
      mono: `${CDN_BASE}sounds-wav-mono/${base}_mono.wav`,
    },
  };
}

function log(...parts) {
  process.stderr.write(`${parts.join(" ")}\n`);
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (index < items.length) {
        const item = items[index++];
        await worker(item);
      }
    }
  );
  await Promise.all(runners);
}

async function fetchWithRetry(url, options, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1_000 * attempt));
    }
  }
  throw lastError;
}

async function headSize(url) {
  const response = await fetchWithRetry(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HEAD ${url} -> ${response.status}`);
  return Number(response.headers.get("content-length") ?? 0);
}

async function downloadFile(entry) {
  const { url, dest, size } = entry;
  if (!REFRESH && size > 0 && existsSync(dest) && statSync(dest).size === size) {
    return { skipped: true };
  }
  const started = Date.now();
  const response = await fetchWithRetry(url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (size > 0 && buffer.length !== size) {
    throw new Error(`truncated download ${url}: ${buffer.length} of ${size} bytes`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buffer);
  return { skipped: false, bytes: buffer.length, ms: Date.now() - started };
}

/**
 * Decode once, learn everything from the same run: the input description on
 * stderr gives codec, rate, channels and container duration, while stdout
 * streams the f32le samples the stats are computed over.
 */
function analyzeFile(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-nostdin",
      "-nostats",
      "-i", path,
      "-map", "0:a:0",
      "-f", "f32le",
      "-acodec", "pcm_f32le",
      "pipe:1",
    ]);

    let stderr = "";
    let settled = false;
    let carry = Buffer.alloc(0);
    let info = null;
    let stats = null;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      rejectPromise(error);
    };

    child.stderr.on("data", (data) => { stderr += data; });

    child.stdout.on("data", (data) => {
      try {
        if (!info) {
          info = parseStreamInfo(stderr);
          if (!info) return; // description not printed yet; keep buffering
          stats = makeChannelAccumulators(info.channels);
        }
        if (!stats) {
          // Input description never arrived but samples are flowing: without
          // a channel count the deinterleave would be fiction.
          return fail(new Error(`no stream description while decoding ${path}`));
        }
        const merged = carry.length ? Buffer.concat([carry, data]) : data;
        const frameBytes = info.channels * 4;
        const frames = Math.floor(merged.length / frameBytes);
        if (frames > 0) {
          processChunk(merged, frames, info.channels, stats);
        }
        carry = Buffer.from(merged.subarray(frames * frameBytes));
      } catch (error) {
        fail(error);
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      try {
        if (!info) {
          info = parseStreamInfo(stderr);
          if (!info) {
            throw new Error(`could not parse stream info for ${path}: ${stderr.slice(-400)}`);
          }
          stats = makeChannelAccumulators(info.channels);
        }
        const frameBytes = info.channels * 4;
        if (carry.length % frameBytes !== 0) {
          // A partial frame means a truncated or misaligned decode; the pair
          // and cross-family checks would compare against fiction.
          throw new Error(`${path}: ${carry.length} trailing bytes, not a whole frame`);
        }
        if (carry.length > 0) processChunk(carry, carry.length / frameBytes, info.channels, stats);
        if (code !== 0) {
          throw new Error(`ffmpeg exited ${code} for ${path}: ${stderr.slice(-400)}`);
        }
        settled = true;
        resolvePromise({ info, stats: finishStats(stats) });
      } catch (error) {
        settled = true;
        rejectPromise(error);
      }
    });

    child.on("error", (error) => fail(new Error(`cannot run ffmpeg: ${error.message}`)));
  });
}

/**
 * ffmpeg names layouts rather than always counting: the 8-channel masters
 * report "7.1", not "8 channels". A dotted layout's channels are the digits'
 * sum (7.1 -> 8, 5.1 -> 6); a bare number is the count; anything else must be
 * a known name or the parse fails loudly — an unparseable spec must never
 * become a guessed deinterleave width.
 */
function parseChannelCount(spec) {
  const explicit = /(\d+)\s*channels/.exec(spec);
  if (explicit) return Number(explicit[1]);
  const dotted = /^(\d+)\.(\d+)$/.exec(spec);
  if (dotted) return Number(dotted[1]) + Number(dotted[2]);
  const named = { mono: 1, stereo: 2, quad: 4, octagonal: 8 };
  if (named[spec]) return named[spec];
  const bare = Number(spec);
  return Number.isInteger(bare) && bare > 0 ? bare : null;
}

function parseStreamInfo(stderr) {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const stream = /Stream #0:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Audio: ([^,]+), (\d+) Hz, ([^,\r\n]+)/.exec(stderr);
  if (!duration || !stream) return null;

  const channels = parseChannelCount(stream[3].trim());
  if (!channels) return null;

  const [, h, m, s] = duration;
  return {
    codec: stream[1].trim(),
    sampleRate: Number(stream[2]),
    channels,
    containerDurationSec: Number(h) * 3600 + Number(m) * 60 + Number(s),
  };
}

function makeChannelAccumulators(channels) {
  return Array.from({ length: channels }, () => ({
    n: 0,
    sum: 0,
    sumSq: 0,
    peak: 0,
    zeros: 0,
    atFullScale: 0,
    overFullScale: 0,
    hash: createHash("sha256"),
  }));
}

/**
 * One chunk of interleaved f32le: deinterleave, accumulate stats, and feed
 * each channel's exact bytes into its rolling digest. Equal digests at EOF
 * mean two channels carried the same samples, sample for sample.
 */
function processChunk(buffer, frames, channels, stats) {
  const interleaved = new Float32Array(buffer.buffer, buffer.byteOffset, frames * channels);
  for (let ch = 0; ch < channels; ch += 1) {
    const acc = stats[ch];
    const view = new Float32Array(frames);
    for (let frame = 0, i = ch; frame < frames; frame += 1, i += channels) {
      view[frame] = interleaved[i];
    }
    for (let frame = 0; frame < frames; frame += 1) {
      const x = view[frame];
      acc.n += 1;
      acc.sum += x;
      acc.sumSq += x * x;
      const magnitude = x < 0 ? -x : x;
      if (magnitude > acc.peak) acc.peak = magnitude;
      if (x === 0) acc.zeros += 1;
      if (magnitude >= 1 - 1e-7) acc.atFullScale += 1;
      if (magnitude > 1) acc.overFullScale += 1;
    }
    acc.hash.update(createHash("sha256").update(Buffer.from(view.buffer, 0, view.byteLength)).digest());
  }
}

function finishStats(stats) {
  return stats.map((acc) => {
    const rms = acc.n > 0 ? Math.sqrt(acc.sumSq / acc.n) : 0;
    return {
      samples: acc.n,
      rms,
      rmsDb: rms > 0 ? Number((20 * Math.log10(rms)).toFixed(2)) : null,
      peak: acc.peak,
      peakDb: acc.peak > 0 ? Number((20 * Math.log10(acc.peak)).toFixed(2)) : null,
      dcOffset: acc.n > 0 ? acc.sum / acc.n : 0,
      zeroSamples: acc.zeros,
      digitallySilent: acc.n > 0 && acc.zeros === acc.n,
      atFullScale: acc.atFullScale,
      overFullScale: acc.overFullScale,
      digest: acc.hash.digest("hex"),
    };
  });
}

function markCopies(channels) {
  const firstWithDigest = new Map();
  channels.forEach((channel, index) => {
    if (firstWithDigest.has(channel.digest)) {
      channel.copyOf = firstWithDigest.get(channel.digest);
    } else {
      firstWithDigest.set(channel.digest, index);
    }
  });
}

function rmsDeltaDb(a, b) {
  if (a === null || b === null) return null;
  if (a === 0 || b === 0) return a === b ? 0 : null;
  return Number((a - b).toFixed(2));
}

async function main() {
  const stateParks = JSON.parse(await readFile(stateParksPath, "utf8"));

  // Enumerate the corpus: every park with audio, every recording, every
  // section, both families, both roles.
  const recordings = [];
  for (const park of stateParks) {
    const recordingsCount = park.recordingsCount ?? 0;
    const sectionsCount = park.sectionsCount ?? 0;
    if (recordingsCount < 1 || sectionsCount < 1) continue;
    const slug = formatParkSlug(park.name);
    for (let recording = 1; recording <= recordingsCount; recording += 1) {
      for (let section = 1; section <= sectionsCount; section += 1) {
        if (recordings.length >= LIMIT) break;
        const urls = recordingUrls(slug, recording, section);
        const families = {};
        for (const family of ["aac", "lossless"]) {
          if (FAMILY_FILTER && family !== FAMILY_FILTER) continue;
          families[family] = Object.fromEntries(
            Object.entries(urls[family]).map(([role, url]) => [
              role,
              { url, dest: join(CACHE_DIR, url.slice(CDN_BASE.length)), size: 0 },
            ])
          );
        }
        recordings.push({
          park: park.name,
          slug,
          recording,
          section,
          families,
        });
      }
      if (recordings.length >= LIMIT) break;
    }
  }

  const fileEntries = recordings.flatMap((r) =>
    Object.values(r.families).flatMap((family) => Object.values(family))
  );
  log(`[audit] ${recordings.length} recordings, ${fileEntries.length} files`);

  mkdirSync(CACHE_DIR, { recursive: true });

  log(`[audit] sizing ${fileEntries.length} files (HEAD)`);
  await runPool(fileEntries, async (entry) => {
    entry.size = await headSize(entry.url);
  }, 8);
  const totalBytes = fileEntries.reduce((n, e) => n + e.size, 0);
  log(`[audit] ${(totalBytes / 1_048_576).toFixed(1)} MB to cache in ${CACHE_DIR}`);

  const downloadFailures = [];
  let downloadedBytes = 0;
  let downloadedCount = 0;
  await runPool(fileEntries, async (entry) => {
    try {
      const result = await downloadFile(entry);
      if (!result.skipped) {
        downloadedBytes += result.bytes;
        downloadedCount += 1;
        log(`[download] ${(result.bytes / 1_048_576).toFixed(1)} MB in ${(result.ms / 1000).toFixed(1)}s  ${entry.url}`);
      }
    } catch (error) {
      downloadFailures.push({ url: entry.url, error: error.message });
      log(`[download] FAILED ${entry.url}: ${error.message}`);
    }
  }, CONCURRENCY);
  log(`[audit] downloaded ${downloadedCount} files (${(downloadedBytes / 1_048_576).toFixed(1)} MB), ${fileEntries.length - downloadedCount} already cached`);

  const report = {
    generatedAt: new Date().toISOString(),
    cacheDir: CACHE_DIR,
    recordingsAnalyzed: recordings.length,
    filesAnalyzed: 0,
    downloadFailures,
    decodeFailures: [],
    recordings: [],
  };

  log(`[audit] decoding and measuring ${fileEntries.length} files`);
  const analysisStarted = Date.now();
  let analyzedCount = 0;

  await runPool(recordings, async (recording) => {
    for (const [_family, roles] of Object.entries(recording.families)) {
      for (const [_role, entry] of Object.entries(roles)) {
        try {
          const { info, stats } = await analyzeFile(entry.dest);
          markCopies(stats);
          entry.result = {
            codec: info.codec,
            sampleRate: info.sampleRate,
            channels: info.channels,
            containerDurationSec: info.containerDurationSec,
            decodedDurationSec: Number((stats[0].samples / info.sampleRate).toFixed(4)),
            sizeBytes: entry.size,
            channelStats: stats,
          };
          report.filesAnalyzed += 1;
        } catch (error) {
          report.decodeFailures.push({ url: entry.url, error: error.message });
          log(`[decode] FAILED ${entry.url}: ${error.message}`);
        }
        analyzedCount += 1;
        if (analyzedCount % 25 === 0) {
          log(`[audit] ${analyzedCount}/${fileEntries.length} files measured (${((Date.now() - analysisStarted) / 1000).toFixed(0)}s)`);
        }
      }

      const eightChannel = roles.eightChannel.result ?? null;
      const mono = roles.mono.result ?? null;
      roles.pair = {
        complete: Boolean(eightChannel && mono),
        sampleRateMatch: Boolean(eightChannel && mono && eightChannel.sampleRate === mono.sampleRate),
        // mergeBuffersByChannel throws on disagreement, so only an exact
        // count match is a pass — "close" puts a channel offset into
        // spatial audio.
        sampleCountMatch: Boolean(eightChannel && mono && eightChannel.channelStats[0].samples === mono.channelStats[0].samples),
      };
    }

    // Cross-family level comparison, so a re-encode that drifts shows up.
    const aac = recording.families.aac;
    const lossless = recording.families.lossless;
    recording.crossFamily = {};
    for (const role of ["eightChannel", "mono"]) {
      const a = aac?.[role].result;
      const b = lossless?.[role].result;
      if (!a || !b || a.channels !== b.channels) {
        recording.crossFamily[role] = null;
        continue;
      }
      const perChannelDeltaDb = a.channelStats.map((channel, index) =>
        rmsDeltaDb(channel.rmsDb, b.channelStats[index].rmsDb)
      );
      // A null delta means one side is digitally silent — the silent-channel
      // class covers that; a level-drift flag wants only real comparisons.
      const comparable = perChannelDeltaDb.filter((delta) => delta !== null);
      recording.crossFamily[role] = {
        maxAbsRmsDeltaDb: comparable.length > 0
          ? Number(Math.max(...comparable.map((delta) => Math.abs(delta))).toFixed(2))
          : 0,
        perChannelDeltaDb,
        durationDeltaMs: Number(((a.decodedDurationSec - b.decodedDurationSec) * 1000).toFixed(1)),
      };
    }

    report.recordings.push(recording);
  }, CONCURRENCY);

  // ── Triage ─────────────────────────────────────────────────────────────
  const anomalies = { pairMismatch: [], silentChannels: [], copiedChannels: [], clipping: [], dcOffset: [], crossFamilyDrift: [] };
  const channel2Verdict = { eightChannelFiles: 0, channel2Silent: 0, otherSilentChannels: [] };

  for (const recording of report.recordings) {
    for (const [family, roles] of Object.entries(recording.families)) {
      const label = `${recording.slug}-${recording.recording}-${String(recording.section).padStart(3, "0")} [${family}]`;
      if (roles.pair && (!roles.pair.complete || !roles.pair.sampleRateMatch || !roles.pair.sampleCountMatch)) {
        anomalies.pairMismatch.push({
          label,
          detail: roles.pair,
          eightChannel: roles.eightChannel.result && { rate: roles.eightChannel.result.sampleRate, samples: roles.eightChannel.result.channelStats[0].samples },
          mono: roles.mono.result && { rate: roles.mono.result.sampleRate, samples: roles.mono.result.channelStats[0].samples },
        });
      }
      for (const [role, entry] of Object.entries(roles)) {
        if (role === "pair" || !entry.result) continue;
        if (role === "eightChannel") {
          channel2Verdict.eightChannelFiles += 1;
          if (entry.result.channelStats[2]?.digitallySilent) channel2Verdict.channel2Silent += 1;
        }
        entry.result.channelStats.forEach((channel, index) => {
          if (channel.digitallySilent && !(role === "eightChannel" && index === 2)) {
            channel2Verdict.otherSilentChannels.push(`${label} ${role} ch${index}`);
          }
          if (channel.copyOf !== undefined) {
            anomalies.copiedChannels.push({ label, role, channel: index, copyOf: channel.copyOf });
          }
          if (channel.atFullScale > 0 || channel.overFullScale > 0) {
            anomalies.clipping.push({ label, role, channel: index, atFullScale: channel.atFullScale, overFullScale: channel.overFullScale, peakDb: channel.peakDb });
          }
          if (Math.abs(channel.dcOffset) > 0.001) {
            anomalies.dcOffset.push({ label, role, channel: index, dcOffset: Number(channel.dcOffset.toFixed(5)) });
          }
        });
      }
    }

    for (const [role, comparison] of Object.entries(recording.crossFamily)) {
      if (comparison && comparison.maxAbsRmsDeltaDb > 0.5) {
        anomalies.crossFamilyDrift.push({ recording: `${recording.slug}-${recording.recording}-${String(recording.section).padStart(3, "0")}`, role, ...comparison });
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`CORPUS AUDIT ${report.generatedAt}`);
  lines.push(`recordings: ${report.recordings.length}, files measured: ${report.filesAnalyzed}, download failures: ${downloadFailures.length}, decode failures: ${report.decodeFailures.length}`);
  lines.push("");
  lines.push(`CHANNEL 2 (rl-6p5): ${channel2Verdict.channel2Silent}/${channel2Verdict.eightChannelFiles} eight-channel files decode with channel 2 digitally silent`);
  if (channel2Verdict.otherSilentChannels.length) {
    lines.push(`other digitally silent channels: ${channel2Verdict.otherSilentChannels.length}`);
    channel2Verdict.otherSilentChannels.forEach((l) => lines.push(`  ${l}`));
  }
  for (const [name, list] of Object.entries(anomalies)) {
    lines.push("");
    lines.push(`${name}: ${list.length}`);
    list.slice(0, 20).forEach((entry) => lines.push(`  ${JSON.stringify(entry)}`));
    if (list.length > 20) lines.push(`  … ${list.length - 20} more`);
  }

  const hardFailures = downloadFailures.length + report.decodeFailures.length + anomalies.pairMismatch.length;
  lines.push("");
  lines.push(hardFailures === 0 ? "HARD FAILURES: none" : `HARD FAILURES: ${hardFailures} (download/decode/pair-mismatch — P1 territory)`);
  const summary = lines.join("\n");
  console.log(summary);

  if (OUT_PATH) {
    await writeFile(resolve(OUT_PATH), JSON.stringify(report, null, 2));
    log(`[audit] full report written to ${resolve(OUT_PATH)}`);
  }

  process.exitCode = hardFailures === 0 ? 0 : 2;
}

main().catch((error) => {
  console.error(`[audit] fatal: ${error.stack ?? error.message}`);
  process.exit(1);
});
