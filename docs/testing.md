# Testing Guide

This repo has a small test suite, but the tests are intentionally split by job so they do not all assert the same thing.

## Suite Map

### `tests/path-replay.spec.ts`

Purpose:
- Covers map and geolocation behavior, not audio correctness.
- Replays a fixed path and verifies the active park changes from Custer Test to Sica Hollow in the debug UI.

Use it when:
- You change geolocation smoothing.
- You change park selection logic.
- You change debug-map or modal opening behavior.

### `tests/audio-loading-mobile.spec.ts`

Purpose:
- Covers the race where the user moves from one park to another while the first park is still loading.
- Verifies the app settles on the latest park, loads the correct audio asset family for the device, and starts playback from the final park.

Use it when:
- You change audio loading flow.
- You change request cancellation or latest-selection logic.
- You change Safari vs Android asset selection.

### `tests/audio-all-parks-mobile.spec.ts`

Purpose:
- Broad regression over every debug-map park.
- Verifies each park can open, load buffers, and begin playback on the supported mobile profiles.

Use it when:
- You change shared audio loading logic.
- You update park metadata or audio files.
- You want breadth coverage after a larger refactor.

Tradeoff:
- This is the slowest broad integration check.

### `tests/audio-worst-case-mobile.spec.ts`

Purpose:
- Stress test for the largest park audio payload under throttled mobile-network conditions.
- Verifies prefetch or cache-assisted loading works and that playback still starts within acceptable timing bounds.

Use it when:
- You change prefetch behavior.
- You change caching behavior.
- You want a realistic “bad network” regression check.

### `tests/audio-paths.test.mjs`

Purpose:
- Fast unit-level validation of CDN path generation.
- Verifies slug overrides, browser-family extension selection, and stable audio-path selection.

Use it when:
- You change `src/utils/audioPaths.js`.
- You change park naming rules.
- You add or rename audio assets.

### `tests/audio-cache-behavior.spec.ts`

Purpose:
- Covers what happens to audio at the edges of a visit: an unwanted prefetch stops downloading, a recent park replays from cache, and audio actually stops when the walker leaves.
- The exit test exists because deleting every `stopSound` call once left the whole suite green.

Use it when:
- You change the buffer cache, prefetch cancellation, or anything that stops playback.

### `tests/playback-resilience.spec.ts`

Purpose:
- Covers playback surviving interruptions — the wake lock, and recovery after the audio context is suspended.

Use it when:
- You change wake-lock handling or the interrupted/resume path.

### `tests/approach-ring.spec.ts`

Purpose:
- Walks twelve steps from 54 m to the park centre and checks the visual approach: rings appear at prefetch range, pulse faster as you close in, and give way to the breathing halo inside the park.
- `APPROACH_RING_HOLD_MS` slows each step down for watching by eye (`npm run sim:ring`).

Use it when:
- You change the ring or halo layers, the prefetch radius, or the proximity zoom.

### `tests/geolocation-status.spec.ts`

Purpose:
- Covers what the walker is told when location is not working: no fix yet, permission denied, a fix too coarse for the geofences, and a watch that has stopped reporting.

Use it when:
- You change the location status overlay or the accuracy and staleness thresholds.

### `tests/accessibility.spec.ts`

Purpose:
- Asserts measured values rather than the presence of a class: contrast ratios for text read in sunlight, 44 px touch targets, reduced-motion behaviour, and the screen-reader announcements for park entry, exit and audio state.

Use it when:
- You restyle anything, or change what is announced.

### `tests/gimbal-orientation.spec.ts`

Purpose:
- Drives synthetic device orientation and checks the listener orientation follows, the map stays centred on the user, and rotation switches off outside the centre radius.
- iphone-13 only. Wants a headed pass by eye — see `GIMBAL_PAUSE=1`.

Use it when:
- You change the gimbal, map centring, or the rotation lifecycle.

### `tests/gimbal-math.spec.ts`

Purpose:
- Characterisation test for the quaternion maths against golden values captured from the original three.js implementation. Runs in Node; no browser.

Use it when:
- You touch `Gimbal.ts` or `quaternion.ts`. A sign error here is inaudible in a test and obvious in a park.

### `tests/park-selection.spec.ts` and `tests/prefetch-proximity.spec.ts`

Purpose:
- Park selection and prefetch-range behaviour driven through the browser.
- Note the overlap with `src/utils/parkSelection.test.ts`, which covers the same functions as fast unit tests.

### `tests/production-surfaces.spec.ts`

Purpose:
- The only spec that runs against a **production build**. Everything else runs against `npm run dev`, where `import.meta.env.DEV` is true and the debug gates are invisible.
- Checks that the `window.__*Debug` mirrors, the `/debug` route and `?mock=` position spoofing do not ship, and that `?debug` still opts back in so the mobile suites can drive a deploy preview.

Run it with `npm run test:e2e:prod` — it builds and previews first, and uses `playwright.prod.config.ts`.

### Unit tests (`src/**/*.test.ts`)

Run by Vitest via `npm test`. They cover the pure logic underneath everything above: geometry and park selection, audio path generation, the buffer cache and loader, channel merging, the variant seed, the decorative frame scheduler, and the reduced-motion map centre.

## Overlap Rules

The suite does have some intentional overlap, but it should stay narrow:

- `path-replay.spec.ts` owns path and park-transition coverage.
- `audio-loading-mobile.spec.ts` owns the “latest park wins” loading race.
- `audio-all-parks-mobile.spec.ts` owns breadth across all parks.
- `audio-worst-case-mobile.spec.ts` owns throttled-network and prefetch timing.
- `audio-paths.test.mjs` owns pure path-generation logic.
- `audio-cache-behavior.spec.ts` owns cache reuse, prefetch cancellation, and audio stopping on exit.
- `accessibility.spec.ts` owns anything measured about legibility, motion, or what is announced.
- `production-surfaces.spec.ts` owns anything that must differ between a dev and a production build.

If a new test does not clearly add one of these coverage angles, it probably belongs as an expansion of an existing file instead of a new spec.

## How To Run

Everything CI runs, in order:

```bash
npm run lint
npm run typecheck     # src, then tests via tsconfig.test.json
npm test              # Vitest unit tests
npm run build
npm run test:e2e      # fast chromium specs
npm run test:e2e:prod # builds and previews, then checks the shipped bundle
```

Fastest targeted commands:

```bash
npm run sim:path
npm run sim:path:iphone
npm run sim:path:pixel
npm run sim:audio:worst:pixel
```

Broader mobile audio commands:

```bash
npm run sim:audio:all:iphone
npm run sim:audio:all:pixel
```

BrowserStack real-device Android Chrome commands:

```bash
export BROWSERSTACK_USERNAME="YOUR_USERNAME"
export BROWSERSTACK_ACCESS_KEY="YOUR_ACCESS_KEY"
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run browserstack:path:android
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run browserstack:audio:all:android
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run browserstack:audio:worst:android
```

These use the BrowserStack SDK plus the repo root `browserstack.yml`. The npm scripts run the named spec files directly, the actual BrowserStack device/browser target is defined in YAML, and the app origin comes from `PLAYWRIGHT_BASE_URL` so BrowserStack can hit the active HTTPS tunnel without BrowserStack Local.

For HTTPS/tunnel-based mobile verification, reuse the active `cloudflared` origin:

```bash
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:path:https:iphone
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:path:https:pixel
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:audio:all:https:iphone
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:audio:all:https:pixel
```

## Audio asset tools

`scripts/` holds three shell tools for the audio itself rather than the app —
see `scripts/README.md`. The one worth knowing about here is:

```bash
npm run audio:check -- "Sica Hollow State Park" all
```

It HEAD-checks every audio URL the app could request against the CDN, by
importing `src/utils/audioPaths.ts` directly, so a renamed or missing file
surfaces there rather than as a park that plays nothing on a walk. Deliberately
not a CI job: it makes one network request per variant against a third-party
CDN.

## Updating The Suite

When a test changes, keep these questions explicit:

- What exact regression is this test meant to catch?
- Which existing test already covers nearby behavior?
- Is this a path test, a loading-race test, a breadth test, a worst-case test, or a pure unit test?

If those answers are not clear, the test will drift into duplication.
