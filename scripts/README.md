# scripts/

Three shell tools for the audio assets. None of them run in CI, and all three
work on files or URLs rather than on the app.

## `check-audio-variants.sh` — `npm run audio:check`

HEAD-checks every audio URL the app could ask for against the CDN, so a
renamed or missing file surfaces here rather than as a park that plays nothing
on a walk.

```bash
npm run audio:check                                    # Good Earth, safari
npm run audio:check -- "Sica Hollow State Park" all
npm run audio:check -- "Custer State Park" safari metadata
```

Arguments: park name, then `safari|chrome|all`, then `generated|metadata`.

- `generated` checks the exact variants the current app code can choose. It
  imports `src/utils/audioPaths.ts` directly, so it stays honest as that logic
  changes — including the browser-family split between FLAC/WAV and AAC.
- `metadata` checks every recording/section combination implied by
  `stateParks.json`, ignoring what the app would pick.

Because it imports the app's TypeScript, it runs through `tsx`. That is the
only reason `tsx` is a dependency; it was `node` until `audioPaths` was
converted to TypeScript, which broke this script silently for four days
because nothing referenced it.

## `convert-m4a-to-wav-safari.sh` — `npm run audio:convert:wav`

Converts `_8ch.m4a` / `_mono.m4a` to WAV, which older Safari decodes reliably
where it will not decode 8-channel AAC. Writes to a sibling `<input-dir>-wav/`.

```bash
npm run audio:convert:wav -- /path/to/sounds
```

## `convert-wav-to-flac.sh` — `npm run audio:convert:flac`

Converts `_8ch.wav` to FLAC — lossless, and roughly half the size of 16-bit
PCM WAV, which matters when a park payload is 10-25 MB over cellular. Writes
to a sibling `<input-dir>-flac/`.

```bash
npm run audio:convert:flac -- /path/to/sounds-wav
```

Both converters need `ffmpeg` on PATH.

## Why `audio:check` is not a CI job

It makes a network request per variant against a third-party CDN — hundreds of
them across all parks. That belongs in a deliberate run before a release or
after uploading new recordings, not on every pull request.
