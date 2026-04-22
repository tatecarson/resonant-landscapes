const CDN_BASE = 'https://resonant-landscapes.b-cdn.net/';
const SESSION_AUDIO_VARIANT_SEED = Math.floor(Math.random() * 0x7fffffff);
const PARK_SLUG_OVERRIDES = {
  'Custer State Park': 'Custer-State',
  'Palisades State Park': 'Palisades-State',
};
const DEBUG_PARK_AUDIO_VARIANTS = {
  'Custer Test': [[
    `${CDN_BASE}sounds/Custer-Test-1-001_8ch.wav`,
    `${CDN_BASE}sounds/Custer-Test-1-001_mono.wav`
  ]],
  'Current Location Test': [[
    `${CDN_BASE}sounds/Custer-Test-1-001_8ch.wav`,
    `${CDN_BASE}sounds/Custer-Test-1-001_mono.wav`
  ]],
};

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

export function formatParkSlug(parkName) {
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

export function getParkAudioVariants(parkName, parksJSON, userAgent = '') {
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

  const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
  // Safari pulls 8ch as FLAC (lossless, ~77% smaller than 16-bit PCM WAV).
  // Mono stays on WAV for Safari because Playwright's open-source WebKit
  // can't decode AAC (lacks the proprietary AudioToolbox codec real iOS
  // Safari uses), which would break the iPhone all-parks regression.
  // Chrome stays on AAC for both variants.
  const spatialFolder = isSafari ? 'sounds-flac' : 'sounds';
  const spatialExtension = isSafari ? 'flac' : 'm4a';
  const monoFolder = isSafari ? 'sounds-wav' : 'sounds';
  const monoExtension = isSafari ? 'wav' : 'm4a';
  const variants = [];

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

export function pickSoundPath(parkName, parksJSON, userAgent = '') {
  const variants = getParkAudioVariants(parkName, parksJSON, userAgent);
  if (!variants?.length) {
    return null;
  }

  const selectedIndex = hashString(`${parkName}:${SESSION_AUDIO_VARIANT_SEED}`) % variants.length;
  const selected = variants[selectedIndex];
  return selected.every(Boolean) ? selected : null;
}
