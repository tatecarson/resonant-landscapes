# Resonant Landscapes

This project is tested with BrowserStack

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

Open this path in your phone browser:

```text
https://<your-tunnel-host>/resonant-landscapes/
```

Example:

```text
https://far-sanyo-inn-premium.trycloudflare.com/resonant-landscapes/
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

### 4. Run against an HTTPS tunnel (optional)

If you already have `cloudflared` running, point Playwright at the tunnel instead of the local HTTP server:

```bash
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:path:https:iphone
PLAYWRIGHT_BASE_URL=https://<your-tunnel-host> npm run sim:path:https:pixel
```

Example:

```bash
PLAYWRIGHT_BASE_URL=https://far-sanyo-inn-premium.trycloudflare.com npm run sim:path:https:iphone
```

This skips Playwright's local `webServer` and navigates the mobile profile against the HTTPS origin directly.

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
