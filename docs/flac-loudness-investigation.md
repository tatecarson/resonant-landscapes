# FLAC vs WAV loudness investigation

**Issue:** [rl-ch3](../.beads/). After rl-wcb (Safari 8ch switched from WAV to FLAC) the real-device iOS playback was reported as quieter than the WAV baseline.

## What was checked

### 1. The decoded samples (bit-identical)

`ffmpeg astats` on `Good-Earth-1-001_8ch.{wav,flac}`:

| | Overall Peak (dB) | Overall RMS (dB) |
| --- | --- | --- |
| WAV | -18.547784 | -44.857946 |
| FLAC | -18.547784 | -44.857946 |

Peak and RMS match to six decimal places. FLAC is lossless by spec and the encode confirmed it — no gain, no normalisation, no ReplayGain. The loudness regression cannot originate in the decoded audio itself.

### 2. FLAC file metadata (no gain tags)

`ffmpeg -i` on the encoded files reports only `Stream #0:0: Audio: flac, 44100 Hz, 7.1, s16`. No `REPLAYGAIN_*` or `ALBUM_GAIN` tags were written by `ffmpeg -c:a flac -compression_level 8`. Side effect: the **7.1 channel-layout hint** is baked into the FLAC container. This was not present on the source WAVs, which were `WAVEFORMATEXTENSIBLE` with an unassigned channel mask (standard for 8-channel HOA content).

### 3. `channelInterpretation` audit of the playback graph

| Node | Owner | `channelInterpretation` |
| --- | --- | --- |
| `AudioBufferSourceNode` | our code ([AudioContextProvider.tsx:277](../src/contexts/AudioContextProvider.tsx#L277)) | default (`speakers`) |
| `Source.input` → `Source._toLate` / `_attenuation.input` / `_directivity.input` / `_encoder.input` | ResonanceAudio | default (`speakers`) |
| Omnitone HOA renderers | Omnitone | explicitly `discrete` |

Our own code sets no channel interpretation anywhere. ResonanceAudio's `Source` builds its chain from plain `context.createGain()` nodes with defaults. The Web Audio default is `channelInterpretation='speakers'`, which applies the spec's up/down-mix matrices **for 1, 2, 4, 6-channel I/O**. Our buffer after `mergeBufferListByChannel` is **9 channels** (8ch spatial + 1ch mono). Nine channels is outside the spec's matrix list, so the spec says discrete mixing should apply — but WebKit has a history of diverging from spec on non-standard channel counts.

## Hypothesis

Safari on iOS is using the FLAC container's 7.1 layout hint to route the buffer differently from how it routed the unlabeled 8-channel WAV. The 7.1 label is a match for the spec's defined 6-channel (5.1) table when Safari looks up downmix rules, which could cause it to:

- Drop or attenuate the LFE channel (position 3 in 7.1 order).
- Apply the 5.1 → stereo downmix matrix for the first six channels.
- Treat the side-L/R pair (positions 6,7) as surrounds rather than discrete HOA components.

Any of those would attenuate the effective output energy relative to the WAV path, which Safari treated as discrete because it had no layout label.

## Recommended fix (cheapest first)

1. **Set `channelInterpretation='discrete'` on the buffer source connection** in `AudioContextProvider.tsx`. One-line change, no re-encode, no re-upload. Tests the hypothesis directly: if this restores WAV-era loudness on a real iPhone, we're done. If it doesn't, the regression is elsewhere and we need the next step.
2. **Instrument with an `AnalyserNode`** on the scene output so we can compare RMS in-browser. Expose a `window.__audioLevelDebug` with peak+RMS over the last N frames; a Playwright or hand-run can capture the numbers on both builds.
3. **Re-encode FLACs without the 7.1 hint** if (1) does not help. FLAC assigns channel order by count for 1–8 channels per spec, so the cleanest way to suppress the label is to encode as 9 channels (pad with a silent channel) or split into mono per channel and load all eight. Both have real tradeoffs (storage, request count, merge logic) so we only go here if (1) and (2) confirm the label is the culprit.

## What we are NOT going to do (yet)

- Add a compressor to paper over the loudness shift. Field recordings rely on dynamic range; compression would degrade the product.
- Add a master gain stage to pre-amp the content. That masks the symptom, and if the real cause is a downmix dropping the LFE, preamp won't restore the missing energy.

Fixing the root cause in (1) is strictly preferable.
