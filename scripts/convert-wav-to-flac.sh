#!/usr/bin/env bash
# Converts all _8ch.wav files to .flac for Safari Web Audio API use.
# Safari >= 11 decodes multichannel FLAC reliably via decodeAudioData,
# and FLAC is lossless and typically ~50% the size of 16-bit PCM WAV.
# Outputs to a sibling folder: <input-dir>-flac/  (e.g. sounds-wav-flac/)
# Usage: ./scripts/convert-wav-to-flac.sh /path/to/sounds-wav

set -euo pipefail

INPUT_DIR="${1:?Usage: $0 <input-dir>}"
OUTPUT_DIR="${INPUT_DIR%/}-flac"

mkdir -p "$OUTPUT_DIR"

shopt -s nullglob
files=("$INPUT_DIR"/*_8ch.wav)

if [[ ${#files[@]} -eq 0 ]]; then
    echo "No _8ch.wav files found in $INPUT_DIR"
    exit 1
fi

echo "Converting ${#files[@]} files to FLAC → $OUTPUT_DIR"

for input in "${files[@]}"; do
    filename="$(basename "$input" .wav).flac"
    output="$OUTPUT_DIR/$filename"

    if [[ -f "$output" ]]; then
        echo "  skip (exists): $filename"
        continue
    fi

    echo "  converting: $filename"
    ffmpeg -loglevel error -i "$input" -c:a flac -compression_level 8 "$output"
done

echo "Done. $(ls "$OUTPUT_DIR"/*.flac 2>/dev/null | wc -l | tr -d ' ') FLAC files in $OUTPUT_DIR"
echo "Input  size: $(du -sh "$INPUT_DIR" | cut -f1)"
echo "Output size: $(du -sh "$OUTPUT_DIR" | cut -f1)"
