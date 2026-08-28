import { getVariantSeed } from '../audio/variantSeed';

const CDN_BASE = 'https://resonant-landscapes.b-cdn.net/';
/** [8-channel spatial URL, mono URL] for one recording section. */
export type AudioVariant = [string, string];

/** The park shape audioPaths needs from stateParks.json. */
export type AudioPark = {
  name: string;
  recordingsCount?: number;
  sectionsCount?: number;
};

const PARK_SLUG_OVERRIDES: Record<string, string> = {
  'Custer State Park': 'Custer-State',
  'Palisades State Park': 'Palisades-State',
};
const DEBUG_PARK_AUDIO_VARIANTS: Record<string, AudioVariant[]> = {
  'Custer Test': [[
    `${CDN_BASE}sounds/Custer-Test-1-001_8ch.wav`,
    `${CDN_BASE}sounds/Custer-Test-1-001_mono.wav`
  ]],
  'Current Location Test': [[
    `${CDN_BASE}sounds/Custer-Test-1-001_8ch.wav`,
    `${CDN_BASE}sounds/Custer-Test-1-001_mono.wav`
  ]],
};

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

export function formatParkSlug(parkName: string): string {
  if (PARK_SLUG_OVERRIDES[parkName]) {
    return PARK_SLUG_OVERRIDES[parkName];
  }

  return parkName
    .replace(/\b(State Park|Historic State Park)\b/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('-');
}

// Engines measured to decode 8-channel AAC from our CDN. Verified 2026-08-20
// with decodeAudioData against real assets (rl-06c.2):
//
//   engine    8ch m4a   8ch flac   mono m4a   mono wav
//   Chromium  OK 8ch    OK 8ch     OK         OK
//   Firefox   OK 8ch    OK 8ch     OK         OK
//   WebKit    FAIL      OK 8ch     FAIL       OK
//
// WebKit here is Playwright's open-source build, which lacks the proprietary
// AudioToolbox codec real iOS Safari ships. Real iOS Safari does decode AAC,
// but serving it FLAC/WAV costs only bandwidth and keeps one code path that
// works in both, so Safari stays on the lossless family.
//
// The iOS wrappers (CriOS, FxiOS, EdgiOS) are deliberately absent. They are all
// WebKit underneath, none of them can be tested from here, and today's branch
// already serves them the lossless family. Leaving them out keeps that.
//
// No \b anchors. Playwright's chromium reports "HeadlessChrome/126", which a
// \bChrome\b would miss, silently flipping the chromium project onto assets
// production Chrome never sees. Bare substrings are safe here because the iOS
// wrapper tokens do not contain these words: CriOS is not Chrome, FxiOS is not
// Firefox. Edg/ keeps its slash so it does not match EdgiOS. Desktop Edge and
// Samsung Internet also carry "Chrome" and would match either way.
const AAC_CAPABLE_ENGINES = /Chrome|Chromium|Firefox|SamsungBrowser|Edg\//;

/**
 * Choose the asset family for a browser.
 *
 * Not a capability check. canPlayType is unusable for this decision: WebKit
 * reports "probably" for audio/mp4; codecs="mp4a.40.2" and then throws
 * EncodingError on the same file, so a positive answer proves nothing. It is
 * only trustworthy as a negative ("" means definitely not).
 *
 * So this is an allowlist with a safe default. Recognised AAC-capable engines
 * get the smaller AAC assets. Everything else, including unknown and future
 * engines, gets FLAC 8ch + WAV mono, the only pair that decoded in every
 * engine tested. An unrecognised browser now gets larger files rather than
 * silence.
 *
 */
export function pickAssetFamily(userAgent = ''): 'aac' | 'lossless' {
  return AAC_CAPABLE_ENGINES.test(userAgent) ? 'aac' : 'lossless';
}

export function getParkAudioVariants(
  parkName: string,
  parksJSON: AudioPark[],
  userAgent = ''
): AudioVariant[] | null {
  if (Object.hasOwn(DEBUG_PARK_AUDIO_VARIANTS, parkName)) {
    return DEBUG_PARK_AUDIO_VARIANTS[parkName];
  }

  const foundPark = parksJSON.find((park) => park.name === parkName);
  if (!foundPark) {
    return null;
  }

  const recordingsCount = foundPark.recordingsCount ?? 0;
  const sectionsCount = foundPark.sectionsCount ?? 0;
  if (recordingsCount < 1 || sectionsCount < 1) {
    return null;
  }

  const cleanParkName = formatParkSlug(foundPark.name);
  if (!cleanParkName) {
    return null;
  }

  const family = pickAssetFamily(userAgent);
  const spatialFolder = family === 'aac' ? 'sounds' : 'sounds-flac';
  const spatialExtension = family === 'aac' ? 'm4a' : 'flac';
  const monoFolder = family === 'aac' ? 'sounds' : 'sounds-wav-mono';
  const monoExtension = family === 'aac' ? 'm4a' : 'wav';
  const variants: AudioVariant[] = [];

  for (let recording = 1; recording <= recordingsCount; recording += 1) {
    for (let section = 1; section <= sectionsCount; section += 1) {
      const paddedSection = String(section).padStart(3, '0');
      const base = `${cleanParkName}-${recording}-${paddedSection}`;
      variants.push([
        `${CDN_BASE}${spatialFolder}/${base}_8ch.${spatialExtension}`,
        `${CDN_BASE}${monoFolder}/${base}_mono.${monoExtension}`
      ]);
    }
  }

  return variants.length > 0 ? variants : null;
}

/** Which recording of a park the walker gets, and how many there are. */
export type SelectedVariant = {
  urls: AudioVariant;
  /** 1-based, for saying "recording 2 of 6" out loud. */
  number: number;
  total: number;
};

/**
 * The seed is read per call rather than captured at module load, so a reroll
 * takes effect on the next park without a page refresh — and so tests can pass
 * their own. It is memoised for the session inside variantSeed, which is what
 * keeps prefetch and playback agreeing on the same recording.
 */
export function selectVariant(
  parkName: string,
  parksJSON: AudioPark[],
  userAgent = '',
  seed: number = getVariantSeed()
): SelectedVariant | null {
  const variants = getParkAudioVariants(parkName, parksJSON, userAgent);
  if (!variants?.length) {
    return null;
  }

  const selectedIndex = hashString(`${parkName}:${seed}`) % variants.length;
  const selected = variants[selectedIndex];
  if (!selected.every(Boolean)) {
    return null;
  }

  return { urls: selected, number: selectedIndex + 1, total: variants.length };
}

export function pickSoundPath(
  parkName: string,
  parksJSON: AudioPark[],
  userAgent = '',
  seed?: number
): AudioVariant | null {
  return selectVariant(parkName, parksJSON, userAgent, seed ?? getVariantSeed())?.urls ?? null;
}
