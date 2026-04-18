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
  if (DEBUG_PARK_AUDIO_VARIANTS[parkName]) {
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
  const extension = isSafari ? 'wav' : 'm4a';
  const soundsFolder = isSafari ? 'sounds-wav' : 'sounds';
  const variants = [];

  for (let recording = 1; recording <= recordingsCount; recording += 1) {
    for (let section = 1; section <= sectionsCount; section += 1) {
      const paddedSection = String(section).padStart(3, '0');
      variants.push([
        `${CDN_BASE}${soundsFolder}/${cleanParkName}-${recording}-${paddedSection}_8ch.${extension}`,
        `${CDN_BASE}${soundsFolder}/${cleanParkName}-${recording}-${paddedSection}_mono.${extension}`
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
