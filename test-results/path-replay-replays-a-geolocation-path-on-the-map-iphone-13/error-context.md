# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: path-replay.spec.ts >> replays a geolocation path on the map
- Location: tests/path-replay.spec.ts:31:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Start playback' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('button', { name: 'Start playback' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - paragraph [ref=e6]: Audio Debug
          - paragraph [ref=e7]: /resonant-landscapes/
        - button [ref=e8] [cursor=pointer]: Hide
      - generic [ref=e9]:
        - paragraph [ref=e10]: "Context: running"
        - paragraph [ref=e11]: "Loading: no"
        - paragraph [ref=e12]: "Playing flag: yes"
        - paragraph [ref=e13]: "Source node: present"
        - paragraph [ref=e14]: "Buffers: loaded"
        - paragraph [ref=e15]: "Duration: 60.00 s"
        - paragraph [ref=e16]: "Channels: 9"
        - paragraph [ref=e17]: "Geo permission: granted"
        - paragraph [ref=e18]: "Coords: 44.01336, -97.11065"
        - paragraph [ref=e19]: "Park: Sica Hollow State Park"
        - generic [ref=e20]: "If sound fails, check whether the context is `suspended`, buffers are empty, or the source node never appears after tapping play."
    - generic [ref=e21]:
      - generic:
        - generic [ref=e25]:
          - button [ref=e26] [cursor=pointer]: +
          - button [ref=e27] [cursor=pointer]: –
        - list [ref=e29]:
          - listitem [ref=e30]:
            - text: ©
            - link [ref=e31]:
              - /url: https://www.openstreetmap.org/copyright
              - text: OpenStreetMap
            - text: contributors.
        - button [ref=e33] [cursor=pointer]: "?"
  - dialog "Sica Hollow State Park" [ref=e37]:
    - generic [ref=e41]:
      - generic [ref=e44]:
        - heading "Sica Hollow State Park" [level=3] [ref=e45]
        - paragraph [ref=e46]: 0 meters away
        - generic [ref=e48]:
          - button "Stop playback" [ref=e49] [cursor=pointer]:
            - img [ref=e50]
          - generic [ref=e52]:
            - generic [ref=e53]: Enable Body-Oriented Tracking
            - switch "Enable Body-Oriented Tracking" [ref=e54] [cursor=pointer]
      - button "Close" [ref=e58] [cursor=pointer]
```

# Test source

```ts
  42  | 
  43  |     console.log(`[browser:${msg.type()}]`, ...args);
  44  |   });
  45  | 
  46  |   page.on("pageerror", (error) => {
  47  |     console.error("[pageerror]", error);
  48  |   });
  49  | 
  50  |   const replayPoints = await readReplayPoints();
  51  |   const firstPoint = replayPoints[0];
  52  |   const replayPath = "/resonant-landscapes/#/debug";
  53  | 
  54  |   if (!baseURL) {
  55  |     throw new Error("Missing Playwright baseURL.");
  56  |   }
  57  | 
  58  |   const permissionOrigin = new URL(baseURL).origin;
  59  | 
  60  |   console.log(`[test] baseURL=${baseURL}`);
  61  |   console.log(`[test] route=${replayPath}`);
  62  |   console.log(`[test] geolocation permission origin=${permissionOrigin}`);
  63  | 
  64  |   await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  65  |   await context.setGeolocation({
  66  |     latitude: firstPoint.latitude,
  67  |     longitude: firstPoint.longitude,
  68  |   });
  69  | 
  70  |   await page.goto(replayPath);
  71  |   await page.waitForLoadState("domcontentloaded");
  72  | 
  73  |   const continueButton = page.getByRole("button", { name: "Continue" });
  74  |   if (await continueButton.count()) {
  75  |     await continueButton.click();
  76  |     await expect(page.getByRole("heading", { name: "Welcome to Resonant Landscapes" })).toHaveCount(0);
  77  |   }
  78  | 
  79  |   const debugToggle = page.getByRole("button", { name: "Open" });
  80  |   await expect(debugToggle).toBeVisible({ timeout: 10_000 });
  81  |   await debugToggle.click();
  82  |   console.log("[test] opened debug panel");
  83  | 
  84  |   console.log(
  85  |     `[test] re-applying first point after load: ${firstPoint.label ?? "unnamed"} (${firstPoint.latitude}, ${firstPoint.longitude})`
  86  |   );
  87  |   await context.setGeolocation({
  88  |     latitude: firstPoint.latitude,
  89  |     longitude: firstPoint.longitude,
  90  |   });
  91  |   await page.waitForTimeout(firstPoint.waitMs ?? defaultStepMs);
  92  | 
  93  |   const parkDebug = page.locator("p", { hasText: "Park:" });
  94  |   await expect(parkDebug).toContainText("Custer Test", { timeout: 15_000 });
  95  |   console.log("[test] debug panel reports park: Custer Test");
  96  | 
  97  |   const parkLabel = page.getByRole("heading", { name: "Custer Test" });
  98  |   await expect(parkLabel).toBeVisible({ timeout: 15_000 });
  99  |   console.log("[test] detected modal heading: Custer Test");
  100 | 
  101 |   const playButton = page.getByRole("button", { name: "Start playback" });
  102 |   await expect(playButton).toBeVisible({ timeout: 15_000 });
  103 |   console.log("[test] clicking play at Custer Test");
  104 |   await playButton.click();
  105 | 
  106 |   await page.waitForFunction(() => {
  107 |     const audioDebug = window.__audioDebug;
  108 |     return Boolean(
  109 |       audioDebug &&
  110 |       audioDebug.lastEvent === "playback-started" &&
  111 |       audioDebug.isPlaying &&
  112 |       audioDebug.hasSourceNode &&
  113 |       audioDebug.hasBuffers &&
  114 |       !audioDebug.loadError
  115 |     );
  116 |   }, null, { timeout: 15_000 });
  117 | 
  118 |   console.log(`[test] holding at Custer Test for ${custerHoldMs}ms`);
  119 |   await page.waitForTimeout(custerHoldMs);
  120 | 
  121 |   const stopButton = page.getByRole("button", { name: "Stop playback" });
  122 |   if (await stopButton.count()) {
  123 |     console.log("[test] stopping playback before leaving Custer Test");
  124 |     await stopButton.click();
  125 |   }
  126 | 
  127 |   for (const [index, point] of replayPoints.slice(1).entries()) {
  128 |     console.log(
  129 |       `[test] replay point ${index + 2}/${replayPoints.length}: ${point.label ?? "unnamed"} (${point.latitude}, ${point.longitude}) wait=${point.waitMs ?? defaultStepMs}ms`
  130 |     );
  131 |     await context.setGeolocation({
  132 |       latitude: point.latitude,
  133 |       longitude: point.longitude,
  134 |     });
  135 |     await page.waitForTimeout(point.waitMs ?? defaultStepMs);
  136 |   }
  137 | 
  138 |   const sicaLabel = page.getByRole("heading", { name: "Sica Hollow State Park" });
  139 |   await expect(sicaLabel).toBeVisible({ timeout: 15_000 });
  140 |   console.log("[test] detected park label: Sica Hollow State Park");
  141 | 
> 142 |   await expect(playButton).toBeVisible({ timeout: 15_000 });
      |                            ^ Error: expect(locator).toBeVisible() failed
  143 | 
  144 |   if (pauseAtPark) {
  145 |     await page.pause();
  146 |   }
  147 | 
  148 |   await playButton.click();
  149 | 
  150 |   await page.waitForFunction(() => {
  151 |     const audioDebug = window.__audioDebug;
  152 |     return Boolean(
  153 |       audioDebug &&
  154 |       audioDebug.lastEvent === "playback-started" &&
  155 |       audioDebug.isPlaying &&
  156 |       audioDebug.hasSourceNode &&
  157 |       audioDebug.hasBuffers &&
  158 |       !audioDebug.loadError
  159 |     );
  160 |   }, null, { timeout: 15_000 });
  161 | 
  162 |   await expect.poll(async () => {
  163 |     return page.evaluate(() => window.__audioDebug ?? null);
  164 |   }).toMatchObject({
  165 |     lastEvent: "playback-started",
  166 |     isPlaying: true,
  167 |     hasSourceNode: true,
  168 |     hasBuffers: true,
  169 |     loadError: null,
  170 |   });
  171 | 
  172 |   await page.screenshot({
  173 |     path: "test-results/path-replay-playing-audio.png",
  174 |     fullPage: true,
  175 |   });
  176 | 
  177 |   await page.waitForTimeout(finalHoldMs);
  178 | });
  179 | 
```