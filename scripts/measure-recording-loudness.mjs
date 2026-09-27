#!/usr/bin/env node
/**
 * Measure how loud every recording comes out of the app, for the
 * per-recording gain table (rl-edv.4).
 *
 * A field test found one listening spot quiet even at its centre, with the
 * phone at full volume. The recordings were the cause, not the rolloff: what
 * reached the speaker spanned about 45 dB across the corpus, and Palisades,
 * one of the parks that was easy to hear, came out near -37 LUFS, some 20 dB
 * under ordinary phone media.
 *
 * Levels are measured where the walker hears them: each recording is rendered
 * in Chromium through the app's own modules — the delivery merge, the
 * high-pass from recordingGain.ts, and the Resonance soundfield scene at a
 * park's centre — into an OfflineAudioContext, and the binaural output is
 * measured before master gain and limiter. An earlier version measured W
 * alone and was misled by it: in the quiet recordings the second-order
 * components run 20 dB hotter than W, reach the output, and made W-levelled
 * quiet parks come out louder than the loud ones.
 *
 * Per recording, from the lossless family (what iPhones are served):
 *   - outLufs: EBU R128 integrated loudness of the stereo output. Metered
 *     with the render scaled so its peak sits at 0 dBFS, and the scaling
 *     subtracted after. ffmpeg's meter only reads between R128's -70 LUFS
 *     absolute gate and +10 LUFS, where it clips; the quietest recordings
 *     are below the gate and a fixed offset large enough to lift them pushes
 *     a levelled render past the clip.
 *   - peakDb: sample peak of the output.
 *   - p9999Db: the level only 0.01% of output samples exceed. Much of the
 *     corpus is quiet ambience with a rare loud transient, so this, not the
 *     sample peak, is what bounds gain; the limiter catches the rest.
 *
 * The policy (target, ceiling, cap) lives in src/audio/recordingGain.ts where
 * it can be tested; this only writes measurements.
 *
 * Needs ffmpeg on PATH and Playwright's Chromium (npx playwright install
 * chromium). Starts its own Vite server; audio streams from the CDN inside
 * the page, so node's certificate store is not involved.
 *
 * Usage:
 *   node scripts/measure-recording-loudness.mjs [--limit N] [--concurrency N]
 *        [--out FILE] [--check]
 *   npm run audio:loudness
 *
 * --check measures, then compares against the committed table and exits 1 if
 * any recording drifted by more than 0.5 dB, so a re-encode, or a change to
 * the filter or the decoder, cannot land without the table being regenerated.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const defaultOutPath = fileURLToPath(new URL("../src/data/recordingLoudness.json", import.meta.url));
const args = process.argv.slice(2);

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const LIMIT = Number(argValue("--limit", 0)) || Infinity;
const CONCURRENCY = Number(argValue("--concurrency", 4)) || 4;
const OUT_PATH = argValue("--out", defaultOutPath);
const CHECK = args.includes("--check");
const CHECK_TOLERANCE_DB = 0.5;

/** Safari gets the lossless family; see pickAssetFamily. */
const LOSSLESS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1";

function log(...parts) {
  process.stderr.write(`${parts.join(" ")}\n`);
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async (_, runner) => {
      while (index < items.length) {
        const item = items[index++];
        await worker(item, runner);
      }
    }
  );
  await Promise.all(runners);
}

/**
 * Level histogram of |sample|, in 0.1 dB bins from HISTOGRAM_FLOOR_DB up to
 * 0 dBFS, for a percentile peak without sorting millions of samples.
 */
const HISTOGRAM_FLOOR_DB = -120;
const HISTOGRAM_BINS_PER_DB = 10;

function levelExceededBy(channels, fraction) {
  const bins = new Float64Array(-HISTOGRAM_FLOOR_DB * HISTOGRAM_BINS_PER_DB + 1);
  let total = 0;
  for (const samples of channels) {
    for (const sample of samples) {
      total += 1;
      const magnitude = Math.abs(sample);
      if (magnitude === 0) continue;
      const bin = Math.floor((20 * Math.log10(magnitude) - HISTOGRAM_FLOOR_DB) * HISTOGRAM_BINS_PER_DB);
      bins[Math.max(0, Math.min(bins.length - 1, bin))] += 1;
    }
  }
  const allowed = total * fraction;
  let above = 0;
  for (let bin = bins.length - 1; bin >= 0; bin -= 1) {
    above += bins[bin];
    if (above > allowed) return HISTOGRAM_FLOOR_DB + bin / HISTOGRAM_BINS_PER_DB;
  }
  return HISTOGRAM_FLOOR_DB;
}

function samplePeakDb(channels) {
  let peak = 0;
  for (const samples of channels) {
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  }
  return peak === 0 ? HISTOGRAM_FLOOR_DB : 20 * Math.log10(peak);
}

/**
 * Integrated loudness of stereo float PCM, via ffmpeg's ebur128, metered
 * `offsetDb` louder and corrected back.
 */
function integratedLufs(left, right, sampleRate, offsetDb) {
  const interleaved = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i += 1) {
    interleaved[2 * i] = left[i];
    interleaved[2 * i + 1] = right[i];
  }
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-nostats", "-hide_banner",
      "-f", "f32le", "-ar", String(sampleRate), "-ac", "2", "-i", "pipe:0",
      "-af", `aformat=sample_fmts=dbl,volume=${offsetDb}dB,ebur128`,
      "-f", "null", "-",
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const matches = [...stderr.matchAll(/I:\s*(-?[\d.]+) LUFS/g)];
      if (code !== 0 || !matches.length) {
        reject(new Error(`ffmpeg ebur128 failed (${code}): ${stderr.split("\n").slice(-4).join(" ")}`));
      } else {
        resolve(Number(matches[matches.length - 1][1]) - offsetDb);
      }
    });
    child.stdin.end(Buffer.from(interleaved.buffer));
  });
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/** Every recording a Safari walker can be served, as delivery URL pairs. */
async function listRecordings(page) {
  return page.evaluate(async (userAgent) => {
    const { getParkAudioVariants } = await import("/src/utils/audioPaths.ts");
    const { recordingBaseFromUrl, HIGHPASS_HZ, HIGHPASS_STAGES } = await import("/src/audio/recordingGain.ts");
    const { default: parks } = await import("/src/data/stateParks.json");
    const recordings = parks
      .flatMap((park) => getParkAudioVariants(park.name, parks, userAgent) ?? [])
      .map((urls) => ({ base: recordingBaseFromUrl(urls[0]), urls }));
    return { recordings, highpassHz: HIGHPASS_HZ, highpassStages: HIGHPASS_STAGES };
  }, LOSSLESS_USER_AGENT);
}

/** Render one recording at a park's centre and hand back the stereo output. */
async function renderRecording(page, urls) {
  const result = await page.evaluate(async (urls) => {
    const { mergeDeliveryBuffers } = await import("/src/audio/mergeBuffers.ts");
    const { createSoundfieldScene, createSoundfieldInput } = await import("/src/audio/soundfield.ts");
    const { createRecordingHighpass } = await import("/src/audio/recordingGain.ts");

    const probe = new OfflineAudioContext(1, 1, 44100);
    const decoded = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return probe.decodeAudioData(await response.arrayBuffer());
    }));
    const { sampleRate, length } = decoded[0];

    const context = new OfflineAudioContext(2, length, sampleRate);
    const buffer = mergeDeliveryBuffers(context, decoded);
    const scene = await createSoundfieldScene(context);
    // Resonance wires its Omnitone renderer into the graph only once the
    // HRIRs have loaded, asynchronously. The app's scene is ready long before
    // a walker reaches a park; an offline render starts at once, and without
    // this wait it rendered part of each recording through nothing, so two
    // runs disagreed by several dB.
    const renderer = scene._listener._renderer;
    while (!renderer._isRendererReady) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    scene.output.connect(context.destination);
    const input = createSoundfieldInput(context, scene);
    input.setDistance(0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    const highpass = createRecordingHighpass(context, buffer.numberOfChannels);
    source.connect(highpass.input);
    highpass.output.connect(input.inputForChannels(buffer.numberOfChannels));
    source.start();

    const rendered = await context.startRendering();
    const toBase64 = (samples) => {
      const bytes = new Uint8Array(samples.buffer);
      let text = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(text);
    };
    return {
      sampleRate,
      channels: [0, 1].map((channel) => toBase64(rendered.getChannelData(channel))),
    };
  }, urls);

  const channels = result.channels.map((encoded) => {
    const bytes = Buffer.from(encoded, "base64");
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  });
  return { sampleRate: result.sampleRate, channels };
}

async function measure(page, urls) {
  const { sampleRate, channels } = await renderRecording(page, urls);
  const peakDb = samplePeakDb(channels);
  return {
    outLufs: round1(await integratedLufs(channels[0], channels[1], sampleRate, -peakDb)),
    peakDb: round1(peakDb),
    p9999Db: round1(levelExceededBy(channels, 1e-4)),
  };
}

async function main() {
  const server = await createServer({
    root,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 4198, strictPort: false },
  });
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  const browser = await chromium.launch();

  try {
    const pages = await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      const page = await browser.newPage();
      await page.goto(origin);
      return page;
    }));

    const listing = await listRecordings(pages[0]);
    const recordingsToMeasure = listing.recordings.slice(0, LIMIT);
    log(`[loudness] rendering ${recordingsToMeasure.length} recordings, ${CONCURRENCY} at a time`);

    const results = {};
    const failures = [];
    let done = 0;
    await runPool(recordingsToMeasure, async ({ base, urls }, runner) => {
      try {
        results[base] = await measure(pages[runner], urls);
      } catch (error) {
        failures.push(`${base}: ${error.message}`);
      }
      done += 1;
      if (done % 10 === 0 || done === recordingsToMeasure.length) {
        log(`[loudness] ${done}/${recordingsToMeasure.length}`);
      }
    }, CONCURRENCY);

    if (failures.length) {
      log(`[loudness] ${failures.length} failed:\n  ${failures.join("\n  ")}`);
      process.exitCode = 1;
      return;
    }

    // Sorted so a regeneration diffs by value, not by completion order.
    const recordings = Object.fromEntries(
      Object.keys(results).sort().map((base) => [base, results[base]])
    );

    if (CHECK) {
      const committed = JSON.parse(await readFile(OUT_PATH, "utf8"));
      const drifted = Object.entries(recordings).filter(([base, now]) => {
        const then = committed.recordings[base];
        return !then || ["outLufs", "peakDb", "p9999Db"].some(
          (key) => Math.abs(then[key] - now[key]) > CHECK_TOLERANCE_DB
        );
      });
      if (committed.highpassHz !== listing.highpassHz || committed.highpassStages !== listing.highpassStages) {
        log("[loudness] the committed table was measured through a different high-pass");
        process.exitCode = 1;
      }
      if (drifted.length) {
        log(`[loudness] ${drifted.length} recordings differ from ${OUT_PATH}:`);
        for (const [base, now] of drifted) {
          log(`  ${base}: committed ${JSON.stringify(committed.recordings[base] ?? null)}, measured ${JSON.stringify(now)}`);
        }
        process.exitCode = 1;
      }
      if (!process.exitCode) log(`[loudness] all ${recordingsToMeasure.length} recordings match the committed table`);
      return;
    }

    const table = {
      $comment:
        "Generated by scripts/measure-recording-loudness.mjs: binaural output at a park's centre, before master gain. Do not edit by hand.",
      highpassHz: listing.highpassHz,
      highpassStages: listing.highpassStages,
      recordings,
    };
    await writeFile(OUT_PATH, `${JSON.stringify(table, null, 2)}\n`);
    log(`[loudness] wrote ${OUT_PATH}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  log(`[loudness] ${error.stack ?? error}`);
  process.exit(1);
});
