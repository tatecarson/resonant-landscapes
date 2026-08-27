# Resonant Landscapes

This project is tested with BrowserStack

## Browser and OS support

Decided 2026-08-20 (rl-06c.1). The app is a spatial-audio walk taken outdoors on
a phone, so support is defined by what can decode 8-channel audio and hold a
geolocation watch, not by market share.

### Supported targets

These are the release targets. A reported break is a bug. The test column says
whether coverage is emulated or runs on a real device.

| Platform | Floor | Tested by |
|---|---|---|
| iOS Safari | 15 | Playwright WebKit and `iphone-13` emulation, plus a real-iPhone release check against the Netlify deploy preview |
| Android Chrome | last 2 major versions | Playwright `pixel-7` emulation and BrowserStack on a real Samsung Galaxy S22 |
| Desktop Chrome | last 2 major versions | Playwright `chromium` project |

iOS 15 is the floor because it is the oldest release with the Web Audio and
DeviceOrientation behaviour the walk depends on, and iOS 15 devices still take
OS updates.

Playwright WebKit does not prove that real iOS Safari decodes the same audio.
Its open-source build lacks the proprietary AAC codec available on iOS. Any
change to audio loading, decoding, or asset selection therefore needs a manual
check on a real iPhone using the PR's HTTPS Netlify deploy preview.

### Best effort

Desktop Safari, desktop and Android Firefox, Edge, and Samsung Internet. These
get the asset family selected for their engine (see `src/utils/audioPaths.js`)
and should work, but CI does not exercise each browser. Bugs reported here get
fixed when they are cheap; they do not block a release.

### Unsupported

Anything else, including any engine the audio-format allowlist does not
recognise. An unrecognised browser is served FLAC 8ch and WAV mono, the pair
that decoded in every engine measured. This favors compatibility over download
size, but it cannot guarantee support for an engine we have not tested. There
is no browser-blocking interstitial and none is planned.

### Not yet enforced mechanically

`tsconfig.json` sets `target: ESNext`, `vite.config.ts` sets no `build.target`,
and `package.json` has no `browserslist` key, so nothing in the build stops a
feature that iOS 15 cannot parse from shipping. Adding those three remains
tracked in rl-06c.1. PR #61 has landed, so its edits no longer block that work.

## Testing

The automated tests are split by intent so each file proves a different behavior:

- `tests/path-replay.spec.ts`: verifies geolocation replay moves the active park from Custer Test to Sica Hollow.
- `tests/audio-loading-mobile.spec.ts`: regression for "latest park wins" when an older park is still loading audio.
- `tests/audio-all-parks-mobile.spec.ts`: broad mobile sweep that checks every debug-map park can load and start playback.
- `tests/audio-worst-case-mobile.spec.ts`: throttled-network regression for the heaviest park and its prefetch/load path.
- `tests/audio-paths.test.mjs`: unit coverage for CDN slug and audio URL generation logic.

See `docs/testing.md` for the longer explanation of what each test is supposed to catch and when to run it.

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

```bash
npm ci
npm run lint       # eslint over src, tests, scripts and config (react-hooks included)
npm run typecheck  # tsc --noEmit for src, then for tests via tsconfig.test.json
npm test           # vitest unit tests
npm run build
npm run test:e2e   # the fast chromium Playwright specs
```

`npm run test:e2e` deliberately covers only the specs that run headless in a
few seconds. The mobile projects (`iphone-13`, `pixel-7`), the audio soaks, and
the BrowserStack runs stay manual — they need real devices, throttled networks,
and multi-megabyte payloads from the CDN.

Node 22 is required (`engines` in `package.json`, plus `.nvmrc`); run
`nvm use` before installing.

## BrowserStack Playwright

BrowserStack is configured for real Android Chrome runs through the BrowserStack Node SDK and the root [browserstack.yml](/Users/tate.carson/other_websites/resonant-landscapes/browserstack.yml).

Set credentials first:

```bash
export BROWSERSTACK_USERNAME="YOUR_USERNAME"
export BROWSERSTACK_ACCESS_KEY="YOUR_ACCESS_KEY"
```

Start or reuse the current `cloudflared` HTTPS tunnel, then run one of the existing mobile specs on BrowserStack with that public origin:

```bash
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run browserstack:path:android
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run browserstack:audio:all:android
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run browserstack:audio:worst:android
```

Notes:
- These commands run the named spec files through the BrowserStack SDK. BrowserStack device and browser selection comes from `browserstack.yml`, not a local Playwright `--project` filter.
- `browserstackLocal: false` is enabled, so BrowserStack connects directly to the public HTTPS tunnel you provide through `PLAYWRIGHT_BASE_URL`.
- The committed config starts with a single real-device Android Chrome target on a Samsung Galaxy S22. Add more devices under `platforms` as needed.

## Phone Field Testing (HTTPS)

iOS sensor/audio permissions require a secure context, so use an HTTPS tunnel for phone testing.

### 1. Install tunnel tool (one-time)

Check if `cloudflared` is installed:

```bash
cloudflared --version
```

If not installed (macOS):

```bash
brew install cloudflared
```

### 2. Start local dev server

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

### 3. Start HTTPS tunnel (new terminal)

```bash
cloudflared tunnel --url http://localhost:4173
```

Copy the generated `https://...trycloudflare.com` URL.

### 4. Open app on phone

Open this URL in your phone browser:

```text
https://<your-tunnel-host>/
```

Example:

```text
https://far-sanyo-inn-premium.trycloudflare.com/
```

### 5. If host is blocked in Vite

Set this in `vite.config.ts`:

```ts
server: {
  allowedHosts: true
}
```

Then restart the dev server.

## Desktop Path Replay (Playwright)

Use this to simulate walking a fixed geolocation path and watch the map dot move on your computer.

### 1. Install browser dependency (one-time)

```bash
npm run sim:path:install
```

### 2. Run the path replay

```bash
npm run sim:path
```

This command:
- starts Vite automatically on `http://127.0.0.1:4173`
- opens a headed Chromium window
- grants geolocation permission
- replays points from `tests/paths/sica-hollow-approach.json`

### 3. Run the mobile-emulated replay

Use the iPhone or Android Playwright device profiles:

```bash
npm run sim:path:iphone
npm run sim:path:pixel
```

These use Playwright mobile emulation for layout, tap flow, and geolocation behavior. They do not replace real-phone testing for iOS sensor/audio quirks.

### 4. Run against the current HTTPS tunnel

For mobile verification, prefer headed Playwright runs against the currently running `cloudflared` tunnel instead of Playwright's local HTTP server.

If `cloudflared` is already running, point Playwright at that tunnel:

```bash
PLAYWRIGHT_BASE_URL=https://students-examines-mold-include.trycloudflare.com npm run sim:path:https:iphone
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:path:https:pixel
```

Example:

```bash
PLAYWRIGHT_BASE_URL=https://contracting-differently-exempt-posted.trycloudflare.com npm run sim:path:https:iphone
```

This skips Playwright's local `webServer` and navigates the mobile profile against the HTTPS origin directly.

These scripts already run in headed mode. Keep reusing the active tunnel URL for repeat runs instead of starting a new local Playwright server.

### 5. Use a custom path file (optional)

Create a JSON file with points:

```json
[
  { "latitude": 44.013000, "longitude": -97.110649, "waitMs": 1500 },
  { "latitude": 44.013120, "longitude": -97.110649, "waitMs": 1500 }
]
```

Then run:

```bash
PATH_REPLAY_FILE=tests/paths/my-path.json npm run sim:path
```

### 6. Adjust speed/hold time (optional)

```bash
PATH_REPLAY_STEP_MS=1000 PATH_REPLAY_FINAL_HOLD_MS=12000 npm run sim:path
```

## Netlify Deployment

This project is configured for Netlify with `netlify.toml`.

Use these settings if you connect the repo in Netlify:

```text
Build command: npm run build
Publish directory: dist
Node version: 22
```

`netlify.toml` pins `NODE_VERSION = "22"` so the deploy matches `.nvmrc`.
