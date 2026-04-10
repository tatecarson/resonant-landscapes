const CDN_BASE = 'https://resonant-landscapes.b-cdn.net/';
const PARK_SLUG_OVERRIDES = {
  'Custer State Park': 'Custer-State',
};

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
  if (parkName === 'Custer Test') {
    return [[
      `${CDN_BASE}sounds/Custer-Test-1-001_8ch.wav`,
      `${CDN_BASE}sounds/Custer-Test-1-001_mono.wav`
    ]];
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

  const selected = variants[Math.floor(Math.random() * variants.length)];
  return selected.every(Boolean) ? selected : null;
}
