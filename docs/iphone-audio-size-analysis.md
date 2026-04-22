# iPhone audio asset size analysis

**Issue:** [rl-5de](../.beads/) — iPhone field use sees slow/unreliable audio loads.

## Current state

[src/utils/audioPaths.js:62-64](../src/utils/audioPaths.js#L62-L64) routes Safari user agents to `sounds-wav/*.wav` and every other UA to `sounds/*.m4a`. Each park variant loads a pair: an 8-channel spatial file (HOA ambisonic) and a mono fallback. Decoding goes through Omnitone's `createBufferList` → `AudioContext.decodeAudioData` ([src/contexts/AudioContextProvider.tsx:202](../src/contexts/AudioContextProvider.tsx#L202)).

WAV was chosen because Safari's `decodeAudioData` has historically been unreliable with multichannel AAC-in-M4A (the 8-channel spatial stems are the blocker; mono AAC decodes fine).

## Measured sizes (representative 60 s clips)

| Park (rec-1 sec-001) | 8ch WAV | 8ch m4a | mono WAV | mono m4a |
|---|---|---|---|---|
| Good Earth | 42.3 MB | 8.5 MB | 5.3 MB | 1.5 MB |
| Palisades State | 42.3 MB | 8.0 MB | 5.3 MB | 1.5 MB |
| Custer State | 42.3 MB | 8.5 MB | 5.3 MB | 1.5 MB |
| Newton Hills | 42.3 MB | 8.8 MB | 5.3 MB | 1.3 MB |

Per selected park on Safari, the client pulls ~**47.6 MB** (8ch+mono WAV). Chrome pulls ~**10 MB** (8ch+mono m4a). WAV headers confirm 44.1 kHz / 16-bit PCM (extensible format for 8ch). This is already the minimum sensible bit depth; the bloat comes from uncompressed multichannel PCM.

## Options evaluated

### 1. Reduced-size WAV (same format, smaller params)

| Change | 8ch size | Risk |
|---|---|---|
| 44.1 → 32 kHz | ~30.7 MB (‑27 %) | Mild HF rolloff above 16 kHz. Field recordings are mostly below 10 kHz; acceptable. |
| 44.1 → 22.05 kHz | ~21.2 MB (‑50 %) | Audible HF loss (birds, insects, hiss). Noticeable on good headphones. |
| 16-bit → 12-bit packed | n/a | Not a standard WAV sub-format; breaks `decodeAudioData`. Reject. |
| Drop to 4 channels (FOA) | ~21.2 MB (‑50 %) | Changes the HOA order. Separate product decision, not a format swap. |

A 32 kHz downsample is a safe, low-effort win (~12 MB saved per park) and keeps everything else identical.

### 2. Alternate formats (still `decodeAudioData`-compatible)

| Format | 8ch size (est.) | Safari Web Audio support | Notes |
|---|---|---|---|
| **FLAC** (lossless, 8ch) | ~20–25 MB (‑45 to ‑55 %) | ✅ Since Safari 11 / iOS 11 in `decodeAudioData` | Lossless, preserves 8-channel layout. Low risk; widely used. |
| **AAC / m4a** (8ch) | ~8 MB (‑80 %) | ⚠️ Multichannel AAC decoding is the reason we switched off m4a originally. Mono/stereo fine; 8ch flaky across iOS versions. | Keep for Chrome. Don't rely on it for Safari 8ch. |
| **Opus** (multichannel) | ~4–6 MB (‑85 %) | ⚠️ Multichannel Opus in `decodeAudioData` is only reliable on Safari 17+ (iOS 17+). Older devices fail. | Too new to be the Safari primary today; viable future path. |
| **MP3** | n/a | ✅ | Doesn't support >2 channels. Reject for 8ch. |

### 3. Hybrid: keep WAV for 8ch, shrink the mono fallback

The mono variant already decodes reliably as AAC on Safari. Swapping `sounds-wav/*_mono.wav` → `sounds/*_mono.m4a` for the Safari mono fallback cuts ~3.8 MB per park with zero decode risk. Small but free.

## Recommendation

Ship two changes, in order of risk/effort:

1. **Re-encode the 8ch Safari assets as FLAC** (`sounds-flac/*_8ch.flac`). Expected ~50 % reduction (42 MB → ~22 MB per clip), lossless, and Safari's `decodeAudioData` has handled FLAC reliably since iOS 11 — which covers every device this app targets. Update [src/utils/audioPaths.js](../src/utils/audioPaths.js) to emit `.flac` + `sounds-flac` for Safari, and add a conversion script alongside [scripts/convert-m4a-to-wav-safari.sh](../scripts/convert-m4a-to-wav-safari.sh) (FLAC encode from the source WAVs via `ffmpeg -c:a flac -compression_level 8`). Validate end-to-end with an iOS Playwright run (existing `sim:audio:all:iphone` spec) and a real-device check before retiring the `sounds-wav/` tree.
2. **Switch the Safari mono fallback to m4a** (reuse the existing `sounds/*_mono.m4a` assets). Saves ~3.8 MB per park at no decode risk; no new encoding needed.

Skip the sample-rate downsample unless FLAC still isn't small enough in practice — it degrades the source and can't be un-done without re-encoding. Defer Opus until the minimum-supported iOS baseline is 17+.

**Net effect per park on Safari:** ~47.6 MB → ~23.5 MB (roughly 2× faster load on cellular), with no change to playback fidelity or the 8ch HOA pipeline.
