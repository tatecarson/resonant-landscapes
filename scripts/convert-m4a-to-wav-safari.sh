#!/usr/bin/env bash
# Converts all _8ch.m4a and _mono.m4a files to .wav for Safari Web Audio API compatibility.
# Outputs to a sibling folder: <input-dir>-wav/
# Usage: ./scripts/convert-m4a-to-wav-safari.sh /path/to/sounds

set -euo pipefail

INPUT_DIR="${1:?Usage: $0 <input-dir>}"
OUTPUT_DIR="${INPUT_DIR%/}-wav"

mkdir -p "$OUTPUT_DIR"

shopt -s nullglob
files=("$INPUT_DIR"/*_8ch.m4a "$INPUT_DIR"/*_mono.m4a)

if [[ ${#files[@]} -eq 0 ]]; then
    echo "No _8ch.m4a or _mono.m4a files found in $INPUT_DIR"
    exit 1
fi

echo "Converting ${#files[@]} files to WAV → $OUTPUT_DIR"

for input in "${files[@]}"; do
    filename="$(basename "$input" .m4a).wav"
    output="$OUTPUT_DIR/$filename"

    if [[ -f "$output" ]]; then
        echo "  skip (exists): $filename"
        continue
    fi

    echo "  converting: $filename"
    ffmpeg -loglevel error -i "$input" -c:a pcm_s16le "$output"
done

echo "Done. $(ls "$OUTPUT_DIR"/*.wav 2>/dev/null | wc -l | tr -d ' ') WAV files in $OUTPUT_DIR"
