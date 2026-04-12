/**
 * Geolocation replay regression for map and park-transition behavior.
 * This test owns the Custer-to-Sica path flow and intentionally avoids
 * audio-specific assertions so audio regressions stay in the dedicated specs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

type ReplayPoint = {
  latitude: number;
  longitude: number;
  waitMs?: number;
  label?: string;
};

type ParkCandidate = {
  name: string;
  distanceMeters: number;
};

type ParkFeature = {
  name: string;
  scaledCoords: [number, number];
};

const DEFAULT_PATH_FILE = "tests/paths/sica-hollow-approach.json";
const STATE_PARKS_FILE = "src/data/stateParks.json";
const defaultStepMs = Number(process.env.PATH_REPLAY_STEP_MS ?? 1500);
const finalHoldMs = Number(process.env.PATH_REPLAY_FINAL_HOLD_MS ?? 6000);
const custerHoldMs = Number(process.env.PATH_REPLAY_CUSTER_HOLD_MS ?? 4000);
const pauseAtPark = process.env.PATH_REPLAY_PAUSE === "1";
const maxDistanceMeters = 15;
const neutralPoint: ReplayPoint = {
  latitude: 44.0115,
  longitude: -97.1095,
  label: "Neutral start",
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceInMeters([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const earthRadiusMeters = 6371008.8;
  const latDelta = toRadians(lat2 - lat1);
  const lonDelta = toRadians(lon2 - lon1);
  const lat1Radians = toRadians(lat1);
  const lat2Radians = toRadians(lat2);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1Radians) *
      Math.cos(lat2Radians) *
      Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

function scaleCoordinates(
  [lon, lat]: [number, number],
  [referenceLon, referenceLat]: [number, number],
  scaleLong: number,
  scaleLat: number
) {
  const scaledLong = (lon - referenceLon) * scaleLong;
  const scaledLat = (lat - referenceLat) * scaleLat;

  return [referenceLon + scaledLong, referenceLat + scaledLat] as [number, number];
}

async function readParkFeatures(): Promise<ParkFeature[]> {
  const absoluteFilePath = path.resolve(process.cwd(), STATE_PARKS_FILE);
  const raw = await fs.readFile(absoluteFilePath, "utf-8");
  const parsed = JSON.parse(raw) as Array<{ name: string; cords: [number, number] }>;
  const referencePoint: [number, number] = [-97.110789, 44.012222];
  const scaleLat = 0.00066;
  const scaleLong = 0.00045;
  const testPark: ParkFeature = {
    name: "Custer Test",
    scaledCoords: [-97.112994, 44.012224],
  };

  return [
    testPark,
    ...parsed.map((park) => ({
      name: park.name,
      scaledCoords: scaleCoordinates(park.cords, referencePoint, scaleLong, scaleLat),
    })),
  ];
}

function getNearbyParks(point: ReplayPoint, parkFeatures: ParkFeature[]): ParkCandidate[] {
  const userLocation: [number, number] = [point.longitude, point.latitude];

  return parkFeatures
    .map((park) => ({
      name: park.name,
      distanceMeters: distanceInMeters(userLocation, park.scaledCoords),
    }))
    .filter((park) => park.distanceMeters < maxDistanceMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function formatNearbyParks(parks: ParkCandidate[]) {
  if (!parks.length) {
    return "none";
  }

  return parks
    .map((park) => `${park.name}:${park.distanceMeters.toFixed(2)}m`)
    .join(", ");
}

async function readDebugParkName(page: Page) {
  const parkDebug = page.locator("p", { hasText: "Park:" });
  const rawText = (await parkDebug.textContent()) ?? "";

  return rawText.replace(/^Park:\s*/, "").trim();
}

async function readDebugCoords(page: Page) {
  const coordsDebug = page.locator("p", { hasText: "Coords:" });
  const rawText = (await coordsDebug.textContent()) ?? "";

  return rawText.replace(/^Coords:\s*/, "").trim();
}

async function ensureDebugPanelExpanded(page: Page) {
  const parkDebug = page.locator("p", { hasText: "Park:" });
  if (await parkDebug.count()) {
    console.log("[test] debug panel already expanded");
    return;
  }

  const debugToggle = page.getByRole("button", { name: /open|hide/i }).last();
  await expect(debugToggle).toBeVisible({ timeout: 10_000 });
  await debugToggle.click();
  await expect(parkDebug).toBeVisible({ timeout: 10_000 });
  console.log("[test] expanded debug panel");
}

async function dismissWelcomeModal(page: Page) {
  const welcomeHeading = page.getByRole("heading", { name: "Welcome to Resonant Landscapes" });
  const continueButton = page.getByRole("button", { name: "Continue" });
  const modalBackdrop = page.locator("#headlessui-portal-root .fixed.inset-0").first();

  if (!(await welcomeHeading.count())) {
    return;
  }

  await expect(welcomeHeading).toBeVisible({ timeout: 10_000 });
  await expect(continueButton).toBeVisible({ timeout: 10_000 });
  await continueButton.click();
  await expect(welcomeHeading).toHaveCount(0, { timeout: 10_000 });
  await expect(modalBackdrop).toHaveCount(0, { timeout: 10_000 });
  console.log("[test] dismissed welcome modal");
}

async function readReplayPoints(): Promise<ReplayPoint[]> {
  const filePath = process.env.PATH_REPLAY_FILE ?? DEFAULT_PATH_FILE;
  const absoluteFilePath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absoluteFilePath, "utf-8");
  const parsed = JSON.parse(raw) as ReplayPoint[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Path replay file is empty or invalid: ${absoluteFilePath}`);
  }

  return parsed;
}

test("replays a geolocation path and updates the active park on the map", async ({ context, page, baseURL }) => {
  page.on("console", async (msg) => {
    const args = await Promise.all(
      msg.args().map(async (arg) => {
        try {
          return await arg.jsonValue();
        } catch {
          return String(arg);
        }
      })
    );

    console.log(`[browser:${msg.type()}]`, ...args);
  });

  page.on("pageerror", (error) => {
    console.error("[pageerror]", error);
  });

  const replayPoints = await readReplayPoints();
  const parkFeatures = await readParkFeatures();
  const firstPoint = replayPoints[0];
  const replayPath = "/#/debug";

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const permissionOrigin = new URL(baseURL).origin;

  console.log(`[test] baseURL=${baseURL}`);
  console.log(`[test] route=${replayPath}`);
  console.log(`[test] geolocation permission origin=${permissionOrigin}`);

  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation({
    latitude: neutralPoint.latitude,
    longitude: neutralPoint.longitude,
  });

  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);

  await ensureDebugPanelExpanded(page);

  console.log(
    `[test] re-applying first point after load: ${firstPoint.label ?? "unnamed"} (${firstPoint.latitude}, ${firstPoint.longitude})`
  );
  // On WebKit, subsequent setGeolocation calls don't always trigger watchPosition callbacks.
  // Keep re-applying the position inside the poll until OL reflects the new coords.
  const parkDebug = page.locator("p", { hasText: "Park:" });
  await expect
    .poll(
      async () => {
        await context.setGeolocation({ latitude: firstPoint.latitude, longitude: firstPoint.longitude });
        return readDebugCoords(page);
      },
      { timeout: 15_000, intervals: [500] }
    )
    .toMatch(new RegExp(firstPoint.latitude.toFixed(3)));
  console.log(`[test] debug coords after first point: ${await readDebugCoords(page)}`);
  console.log(`[test] debug park after first point: ${await readDebugParkName(page)}`);
  await expect(parkDebug).toContainText("Custer Test", { timeout: 15_000 });
  console.log("[test] debug panel reports park: Custer Test");

  const parkLabel = page.getByRole("heading", { name: "Custer Test" });
  await expect(parkLabel).toBeVisible({ timeout: 15_000 });
  console.log("[test] detected modal heading: Custer Test");

  console.log(`[test] holding at Custer Test for ${custerHoldMs}ms`);
  await page.waitForTimeout(custerHoldMs);

  for (const [index, point] of replayPoints.slice(1).entries()) {
    const nearbyParks = getNearbyParks(point, parkFeatures);

    console.log(
      `[test] replay point ${index + 2}/${replayPoints.length}: ${point.label ?? "unnamed"} (${point.latitude}, ${point.longitude}) wait=${point.waitMs ?? defaultStepMs}ms`
    );
    console.log(`[test] in-range parks: ${formatNearbyParks(nearbyParks)}`);
    await context.setGeolocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    await page.waitForTimeout(point.waitMs ?? defaultStepMs);

    if (point.label === "Sica approach 3") {
      expect(nearbyParks.map((park) => park.name)).toEqual([
        "Sica Hollow State Park",
        "Hartford Beach State Park",
      ]);
      console.log(`[test] expected nearest park at overlap point: ${nearbyParks[0]?.name ?? "none"}`);

      // Keep pumping setGeolocation so the position-smoothing lag converges to this
      // point. Without pumping, deltaMeanRef stays ~1500ms and the interpolated
      // position remains near approach 1/2 (only Hartford Beach in range).
      await expect
        .poll(
          async () => {
            await context.setGeolocation({ latitude: point.latitude, longitude: point.longitude });
            return readDebugParkName(page);
          },
          { timeout: 15_000, intervals: [500] }
        )
        .toBe("Sica Hollow State Park");
      console.log(`[test] selected park at overlap point: ${await readDebugParkName(page)}`);
    }
  }

  const sicaLabel = page.getByRole("heading", { name: "Sica Hollow State Park" });
  await expect(sicaLabel).toBeVisible({ timeout: 15_000 });
  console.log("[test] detected park label: Sica Hollow State Park");

  await expect(parkDebug).toContainText("Sica Hollow State Park", { timeout: 15_000 });
  console.log("[test] debug panel reports park: Sica Hollow State Park");

  if (pauseAtPark) {
    await page.pause();
  }

  await page.screenshot({
    path: "test-results/path-replay-arrived-at-sica.png",
    fullPage: true,
  });

  await page.waitForTimeout(finalHoldMs);
});
