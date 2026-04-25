/**
 * Verifies that GimbalArrow's render loop responds to DeviceOrientationEvents
 * and calls setListenerOrientation on the ResonanceAudio scene.
 *
 * Uses CDP to inject synthetic device orientation events at the browser level.
 * Permission is seeded two ways: localStorage is pre-populated with "granted"
 * (satisfying hasStoredOrientationPermission) and DeviceOrientationEvent.requestPermission
 * is stubbed to return "granted" (Chromium doesn't implement it natively).
 *
 * Run with:
 *   npx playwright test gimbal-orientation --project=iphone-13
 *
 * To pause and interact manually (hear the audio pan):
 *   GIMBAL_PAUSE=1 npx playwright test gimbal-orientation --project=iphone-13 --headed
 */
import { expect, test } from "@playwright/test";
import { dismissWelcomeModal } from "./helpers/app-flow";
import {
  dispatchDeviceOrientation,
  seedDeviceOrientationHarness,
} from "./helpers/device-orientation";

const HARTFORD_BEACH_CENTER = { latitude: 44.01320393, longitude: -97.11059202 };
const HARTFORD_BEACH_OUTSIDE_CENTER = { latitude: 44.01325393, longitude: -97.11059202 };
type GimbalOrientationSnapshot = {
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  upX: number;
  upY: number;
  upZ: number;
  updatedAt: number;
};

type MapDebugSnapshot = {
  center: [number, number] | null;
  position: [number, number];
  rotation: number;
  centerOnUser: boolean;
  markerPixel: [number, number] | null;
  viewportSize: [number, number] | null;
};

async function readAmbientGradient(page: import("@playwright/test").Page) {
  return page.getByTestId("ambient-gradient").evaluate((el) => getComputedStyle(el).backgroundImage);
}

async function readMapDebug(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.__mapDebug ?? null) as Promise<MapDebugSnapshot | null>;
}

async function startPreviewRotationLoop(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const previewWindow = window as Window & {
      __dispatchDeviceOrientation: (nextAlpha: number, beta: number, gamma: number) => void;
      __gimbalPreviewLoopId?: number;
    };

    if (previewWindow.__gimbalPreviewLoopId !== undefined) {
      window.clearTimeout(previewWindow.__gimbalPreviewLoopId);
    }

    const alphaStep = 2;
    let alpha = 0;

    const tick = () => {
      previewWindow.__dispatchDeviceOrientation(alpha, -90, 0);
      alpha = (alpha + alphaStep) % 360;
      previewWindow.__gimbalPreviewLoopId = window.setTimeout(tick, 32);
    };

    tick();
  });
}

async function stopPreviewRotationLoop(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const previewWindow = window as Window & {
      __gimbalPreviewLoopId?: number;
    };

    if (previewWindow.__gimbalPreviewLoopId !== undefined) {
      window.clearTimeout(previewWindow.__gimbalPreviewLoopId);
      delete previewWindow.__gimbalPreviewLoopId;
    }
  });
}

function distanceBetweenPoints(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

test("GimbalArrow updates listener orientation when device rotates", async ({
  context,
  page,
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone-13",
    "Gimbal orientation test is only meaningful on the iphone-13 project."
  );

  if (!baseURL) throw new Error("Missing Playwright baseURL.");

  page.on("console", async (msg) => {
    const args = await Promise.all(
      msg.args().map(async (arg) => {
        try { return await arg.jsonValue(); }
        catch { return String(arg); }
      })
    );
    console.log(`[browser:${msg.type()}]`, ...args);
  });

  page.on("pageerror", (err) => console.error("[pageerror]", err));

  // Position user exactly at Hartford Beach center (0 m → satisfies <= 3 m for rotation toggle)
  const permissionOrigin = new URL(baseURL).origin;
  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(HARTFORD_BEACH_CENTER);

  await seedDeviceOrientationHarness(page);

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);

  await page.evaluate(() => {
    window.localStorage.setItem("deviceOrientationPermission", "granted");
  });

  // Wait for the map to be interactive before re-applying position
  const mapCanvas = page.locator("canvas").first();
  await expect(mapCanvas).toBeVisible({ timeout: 15_000 });

  // Re-apply position to ensure the geolocation watcher picks it up
  await context.setGeolocation(HARTFORD_BEACH_CENTER);

  // Wait for the compact park strip
  const parkStrip = page.locator("p.font-cormorant", { hasText: "Hartford Beach State Park" });
  await expect(parkStrip).toBeVisible({ timeout: 20_000 });
  console.log("[test] Hartford Beach State Park strip open");

  // Wait for audio to load and autoplay
  await expect.poll(() => page.evaluate(() => window.__audioDebug?.hasBuffers ?? false), {
    timeout: 15_000,
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
    timeout: 10_000,
  }).toBe(true);
  console.log("[test] audio autoplay active");

  // Rotation should auto-enable once audio is playing and the user is at center range.
  await expect
    .poll(() => page.evaluate(() => (window as Window).__gimbalOrientation?.updatedAt ?? null), {
      timeout: 10_000,
    })
    .not.toBeNull();
  console.log("[test] body-oriented tracking enabled automatically");

  // Start the visible rotation preview before the map-centering assertion so
  // a failing centerOnUser check does not hide the headed-mode motion entirely.
  await startPreviewRotationLoop(page);
  console.log("[test] continuous rotation preview running");

  await expect
    .poll(async () => (await readMapDebug(page))?.centerOnUser ?? false, {
      timeout: 10_000,
    })
    .toBe(true);
  console.log("[test] map switched to center-on-user mode");

  // GimbalArrow should now be mounted and writing to (window as any).__gimbalOrientation
  console.log("[test] gimbal render loop is running");

  // Quick two-point check: verify forward vector differs at alpha=0 vs alpha=90
  // (phone upright, beta=-90, so alpha rotation is meaningful)
  await stopPreviewRotationLoop(page);
  await dispatchDeviceOrientation(page, 0);
  await page.waitForTimeout(200);
  const o0 = await page.evaluate<GimbalOrientationSnapshot>(() => (window as Window).__gimbalOrientation!);
  const bg0 = await readAmbientGradient(page);
  const map0 = await readMapDebug(page);

  await dispatchDeviceOrientation(page, 90);
  await page.waitForTimeout(200);
  const o90 = await page.evaluate<GimbalOrientationSnapshot>(() => (window as Window).__gimbalOrientation!);
  const bg90 = await readAmbientGradient(page);
  const map90 = await readMapDebug(page);

  await dispatchDeviceOrientation(page, 180);
  await page.waitForTimeout(200);
  const bg180 = await readAmbientGradient(page);
  const map180 = await readMapDebug(page);

  console.log(`[test] alpha=  0° → fwd=(${o0.fwdX.toFixed(3)}, ${o0.fwdY.toFixed(3)}, ${o0.fwdZ.toFixed(3)})`);
  console.log(`[test] alpha= 90° → fwd=(${o90.fwdX.toFixed(3)}, ${o90.fwdY.toFixed(3)}, ${o90.fwdZ.toFixed(3)})`);
  expect(o0.fwdX.toFixed(2)).not.toBe(o90.fwdX.toFixed(2));
  expect(bg0).not.toBe(bg90);
  expect(bg90).not.toBe(bg180);
  expect(map0?.center).not.toBeNull();
  expect(map90?.center).not.toBeNull();
  expect(map180?.center).not.toBeNull();
  expect(distanceBetweenPoints(map0!.center!, map0!.position)).toBeLessThan(0.001);
  expect(distanceBetweenPoints(map90!.center!, map90!.position)).toBeLessThan(0.001);
  expect(distanceBetweenPoints(map180!.center!, map180!.position)).toBeLessThan(0.001);
  console.log("[test] forward vector changes with rotation ✓");
  console.log(`[test] ambient gradient updated ✓ ${bg0} -> ${bg90} -> ${bg180}`);
  console.log("[test] map center stays pinned to user position ✓");

  // Pixel-space check: the rendered marker (the user dot) must stay at viewport
  // center across rotations. This catches anchor-offset bugs that the
  // map-coordinate equality above misses, since OL pins the icon's anchor — not
  // the visible dot — to the geographic point.
  for (const [label, snap] of [["alpha=0", map0], ["alpha=90", map90], ["alpha=180", map180]] as const) {
    expect(snap?.markerPixel, `${label} markerPixel`).not.toBeNull();
    expect(snap?.viewportSize, `${label} viewportSize`).not.toBeNull();
    const [px, py] = snap!.markerPixel!;
    const [w, h] = snap!.viewportSize!;
    const dx = Math.abs(px - w / 2);
    const dy = Math.abs(py - h / 2);
    // Allow 1px slack for sub-pixel rounding; the anchor offset bug produced ~15px.
    expect(dx, `${label} marker dx from viewport center`).toBeLessThan(1.5);
    expect(dy, `${label} marker dy from viewport center`).toBeLessThan(1.5);
  }
  console.log("[test] user-dot stays at viewport center across rotations ✓");

  // Resume the continuous 360° preview loop for headed observation.
  await startPreviewRotationLoop(page);
  console.log("[test] continuous rotation loop running — watch 'heading' in modal");

  if (process.env.GIMBAL_PAUSE === "1") {
    await page.pause();
  }

  await stopPreviewRotationLoop(page);
});

test("shows the rotation affordance before tracking is enabled at center", async ({
  context,
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing Playwright baseURL.");

  const permissionOrigin = new URL(baseURL).origin;
  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(HARTFORD_BEACH_CENTER);

  await seedDeviceOrientationHarness(page);

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);

  await page.evaluate(() => {
    window.localStorage.removeItem("deviceOrientationPermission");
  });

  const mapCanvas = page.locator("canvas").first();
  await expect(mapCanvas).toBeVisible({ timeout: 15_000 });
  await context.setGeolocation(HARTFORD_BEACH_CENTER);

  await expect(page.locator("p.font-cormorant", { hasText: "Hartford Beach State Park" })).toBeVisible({
    timeout: 20_000,
  });

  await expect.poll(() => page.evaluate(() => window.__audioDebug?.hasBuffers ?? false), {
    timeout: 15_000,
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
    timeout: 10_000,
  }).toBe(true);

  const enableRotation = page.getByRole("button", { name: /Enable rotation/i });
  await expect(enableRotation).toBeVisible({ timeout: 10_000 });
  await expect(enableRotation).toHaveAttribute("data-emphasized", "true");
  await expect.poll(() => enableRotation.evaluate((node) => getComputedStyle(node).animationName), {
    timeout: 5_000,
  }).toBe("rotation-affordance-breathe");

  await expect(page.getByLabel("Spatial tracking active")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as Window).__gimbalOrientation?.updatedAt ?? null), {
      timeout: 1_000,
    })
    .toBeNull();

  if (process.env.ROTATION_AFFORDANCE_PAUSE === "1") {
    await page.pause();
  }
});

test("rotation tracking stops after leaving the center radius", async ({
  context,
  page,
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone-13",
    "Gimbal orientation test is only meaningful on the iphone-13 project."
  );

  if (!baseURL) throw new Error("Missing Playwright baseURL.");

  page.on("console", async (msg) => {
    const args = await Promise.all(
      msg.args().map(async (arg) => {
        try { return await arg.jsonValue(); }
        catch { return String(arg); }
      })
    );
    console.log(`[browser:${msg.type()}]`, ...args);
  });

  page.on("pageerror", (err) => console.error("[pageerror]", err));

  const permissionOrigin = new URL(baseURL).origin;
  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(HARTFORD_BEACH_CENTER);

  await seedDeviceOrientationHarness(page);

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);

  await page.evaluate(() => {
    window.localStorage.setItem("deviceOrientationPermission", "granted");
  });

  const mapCanvas = page.locator("canvas").first();
  await expect(mapCanvas).toBeVisible({ timeout: 15_000 });
  await context.setGeolocation(HARTFORD_BEACH_CENTER);

  await expect(page.locator("p.font-cormorant", { hasText: "Hartford Beach State Park" })).toBeVisible({
    timeout: 20_000,
  });

  await expect.poll(() => page.evaluate(() => window.__audioDebug?.hasBuffers ?? false), {
    timeout: 15_000,
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
    timeout: 10_000,
  }).toBe(true);

  const trackingLabel = page.getByLabel("Spatial tracking active");
  const centeredMarker = page.locator(".centered-geolocation-control");
  await expect(centeredMarker).toHaveClass(/centered-geolocation-control--active/, { timeout: 10_000 });
  await expect(trackingLabel).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(() => page.evaluate(() => (window as Window).__gimbalOrientation?.updatedAt ?? null), {
      timeout: 10_000,
    })
    .not.toBeNull();

  await context.setGeolocation(HARTFORD_BEACH_OUTSIDE_CENTER);
  await expect(trackingLabel).toHaveCount(0, { timeout: 10_000 });
  await expect(centeredMarker).toHaveClass(/centered-geolocation-control--hidden/, { timeout: 10_000 });

  await page.waitForTimeout(300);
  const stoppedAt = await page.evaluate(() => (window as Window).__gimbalOrientation?.updatedAt ?? null);
  await dispatchDeviceOrientation(page, 45);
  await page.waitForTimeout(300);

  await expect(page.evaluate(() => (window as Window).__gimbalOrientation?.updatedAt ?? null)).resolves.toBe(stoppedAt);
});
