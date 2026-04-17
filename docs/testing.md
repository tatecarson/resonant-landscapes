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

## Overlap Rules

The suite does have some intentional overlap, but it should stay narrow:

- `path-replay.spec.ts` owns path and park-transition coverage.
- `audio-loading-mobile.spec.ts` owns the “latest park wins” loading race.
- `audio-all-parks-mobile.spec.ts` owns breadth across all parks.
- `audio-worst-case-mobile.spec.ts` owns throttled-network and prefetch timing.
- `audio-paths.test.mjs` owns pure path-generation logic.

If a new test does not clearly add one of these coverage angles, it probably belongs as an expansion of an existing file instead of a new spec.

## How To Run

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

## Updating The Suite

When a test changes, keep these questions explicit:

- What exact regression is this test meant to catch?
- Which existing test already covers nearby behavior?
- Is this a path test, a loading-race test, a breadth test, a worst-case test, or a pure unit test?

If those answers are not clear, the test will drift into duplication.
