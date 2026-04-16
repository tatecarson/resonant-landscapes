#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PARK_NAME="${1:-Good Earth State Park}"
BROWSER_FAMILY="${2:-safari}"
VARIANT_MODE="${3:-generated}"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") "<park name>" [safari|chrome|all] [generated|metadata]

Examples:
  $(basename "$0") "Good Earth State Park" safari
  $(basename "$0") "Good Earth State Park" safari metadata
  $(basename "$0") "Custer State Park" all

This script uses src/utils/audioPaths.js to enumerate every generated audio
variant for the requested park/browser family, then HEAD-checks each URL on the
CDN with curl.

Modes:
  generated  Check the exact variants the current app code can choose.
  metadata   Check every recording/section variant implied by stateParks.json,
             ignoring app-specific overrides.
EOF
}

if [[ "$PARK_NAME" == "-h" || "$PARK_NAME" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$BROWSER_FAMILY" != "safari" && "$BROWSER_FAMILY" != "chrome" && "$BROWSER_FAMILY" != "all" ]]; then
  echo "Unsupported browser family: $BROWSER_FAMILY" >&2
  usage >&2
  exit 1
fi

if [[ "$VARIANT_MODE" != "generated" && "$VARIANT_MODE" != "metadata" ]]; then
  echo "Unsupported variant mode: $VARIANT_MODE" >&2
  usage >&2
  exit 1
fi

TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

(
  cd "$REPO_ROOT"
  node --input-type=module - "$PARK_NAME" "$BROWSER_FAMILY" "$VARIANT_MODE" <<'EOF'
import stateParks from './src/data/stateParks.json' with { type: 'json' };
import { formatParkSlug, getParkAudioVariants, pickSoundPath } from './src/utils/audioPaths.js';

const parkName = process.argv[2];
const browserFamily = process.argv[3];
const variantMode = process.argv[4];
const CDN_BASE = 'https://resonant-landscapes.b-cdn.net/';
const browserConfigs = browserFamily === 'all'
  ? [
      { label: 'safari', userAgent: 'Safari' },
      { label: 'chrome', userAgent: 'Chrome' },
    ]
  : [
      {
        label: browserFamily,
        userAgent: browserFamily === 'safari' ? 'Safari' : 'Chrome',
      },
    ];

const park = stateParks.find((entry) => entry.name === parkName) ?? (parkName === 'Custer Test' ? { name: parkName } : null);
if (!park) {
  console.error(`Unknown park: ${parkName}`);
  process.exit(1);
}

function getMetadataVariants(parkName, userAgent) {
  if (parkName === 'Custer Test') {
    return [[
      `${CDN_BASE}sounds/Custer-Test-1-001_8ch.wav`,
      `${CDN_BASE}sounds/Custer-Test-1-001_mono.wav`,
    ]];
  }

  const foundPark = stateParks.find((entry) => entry.name === parkName);
  if (!foundPark) {
    return null;
  }

  const recordingsCount = foundPark.recordingsCount ?? 0;
  const sectionsCount = foundPark.sectionsCount ?? 0;
  if (recordingsCount < 1 || sectionsCount < 1) {
    return null;
  }

  const cleanParkName = formatParkSlug(foundPark.name);
  const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
  const extension = isSafari ? 'wav' : 'm4a';
  const soundsFolder = isSafari ? 'sounds-wav' : 'sounds';
  const variants = [];

  for (let recording = 1; recording <= recordingsCount; recording += 1) {
    for (let section = 1; section <= sectionsCount; section += 1) {
      const paddedSection = String(section).padStart(3, '0');
      variants.push([
        `${CDN_BASE}${soundsFolder}/${cleanParkName}-${recording}-${paddedSection}_8ch.${extension}`,
        `${CDN_BASE}${soundsFolder}/${cleanParkName}-${recording}-${paddedSection}_mono.${extension}`,
      ]);
    }
  }

  return variants;
}

for (const config of browserConfigs) {
  const variants = variantMode === 'metadata'
    ? getMetadataVariants(parkName, config.userAgent)
    : getParkAudioVariants(parkName, stateParks, config.userAgent);
  if (!variants?.length) {
    console.error(`No variants generated for ${parkName} (${config.label}, ${variantMode})`);
    process.exit(1);
  }

  const selected = variantMode === 'generated'
    ? pickSoundPath(parkName, stateParks, config.userAgent)
    : null;
  const selectedKey = selected ? selected.join('||') : null;

  variants.forEach(([spatialUrl, monoUrl], index) => {
    const isSelected = `${spatialUrl}||${monoUrl}` === selectedKey ? 'selected' : 'unselected';
    process.stdout.write([
      config.label,
      String(index + 1),
      isSelected,
      spatialUrl,
      monoUrl,
    ].join('\t') + '\n');
  });
}
EOF
) > "$TMP_OUTPUT"

check_url() {
  local url="$1"
  local response
  if ! response="$(curl -I -sS "$url" 2>&1)"; then
    echo "FAIL"
    echo "$response" | awk 'NR==1 { print "      " $0 }'
    return
  fi

  local status
  status="$(printf '%s\n' "$response" | awk 'toupper($0) ~ /^HTTP\// { print $2; exit }')"
  local length
  length="$(printf '%s\n' "$response" | awk 'BEGIN{IGNORECASE=1} /^content-length:/ { print $2; exit }' | tr -d '\r')"
  echo "OK  status=${status:-unknown} bytes=${length:-unknown}"
}

echo "Checking generated audio variants for: $PARK_NAME"
echo "Browser family: $BROWSER_FAMILY"
if [[ "$VARIANT_MODE" == "generated" ]]; then
  echo "Mode: variants generated by current audioPaths.js logic"
else
  echo "Mode: raw metadata-driven recording/section combinations"
fi
echo

while IFS=$'\t' read -r browserLabel variantIndex selectedMarker spatialUrl monoUrl; do
  local_label="${browserLabel} variant ${variantIndex}"
  if [[ "$selectedMarker" == "selected" ]]; then
    local_label+=" (session-selected)"
  fi

  echo "$local_label"
  echo "  spatial: $spatialUrl"
  echo "    $(check_url "$spatialUrl")"
  echo "  mono:    $monoUrl"
  echo "    $(check_url "$monoUrl")"
  echo
done < "$TMP_OUTPUT"
