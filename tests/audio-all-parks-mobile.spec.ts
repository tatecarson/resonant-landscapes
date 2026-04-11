/**
 * Broad mobile regression that walks the debug map through every park.
 * This is the suite's breadth check: each park should open, load buffers,
 * and start playback at least once on the supported mobile profiles.
 */
import fs from "node:fs/promises";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { scaleCoordinates } from "../src/utils/geo.js";

type Coordinate = [number, number];

type AudioDebugState = {
  contextState: string;
  isLoading: boolean;
  isPlaying: boolean;
  hasBuffers: boolean;
  bufferDuration: number | null;
  bufferChannels: number | null;
  hasSourceNode: boolean;
  loadError: string | null;
  lastEvent: string | null;
};

type ParkRunResult = {
  parkName: string;
  loadTimeMs: number | null;
  playStartTimeMs: number | null;
  audioRequestUrls: string[];
  audioRequestCount: number;
  bufferDuration: number | null;
  bufferChannels: number | null;
  status: "passed" | "failed";
  failureReason: string | null;
};

const replayPath = "/#/debug";
const neutralPoint: Coordinate = [-97.1098, 44.0142];
const scaleLat = 0.00066;
const scaleLong = 0.00045;
const referencePoint: Coordinate = [-97.110789, 44.012222];
const centerSettleMs = Number(process.env.ALL_PARKS_CENTER_SETTLE_MS ?? 300);
const loadTimeoutMs = Number(process.env.ALL_PARKS_LOAD_TIMEOUT_MS ?? 20_000);
const playTimeoutMs = Number(process.env.ALL_PARKS_PLAY_TIMEOUT_MS ?? 15_000);
const playbackHoldMs = Number(process.env.ALL_PARKS_PLAYBACK_HOLD_MS ?? 3_000);

const debugParks = [
  {
    name: "Custer Test",
    scaledCoords: [-97.112994, 44.012224] as Coordinate,
  },
  ...stateParks.map((park) => ({
    name: park.name,
    scaledCoords: scaleCoordinates(park.cords as Coordinate, referencePoint, scaleLong, scaleLat) as Coordinate,
  })),
];

function getExpectedSlug(parkName: string) {
  switch (parkName) {
    case "Custer Test":
      return "Custer-Test";
    case "Custer State Park":
      return "Custer-State";
    case "Palisades State Park":
      return "Palisades-State";
    default:
      return parkName
        .replace(/\b(State Park|Historic State Park)\b/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join("-");
  }
}

async function dismissWelcomeIfPresent(page: Page) {
  const continueButton = page.getByRole("button", { name: "Continue" });
  if (await continueButton.count()) {
    await continueButton.click();
    await expect(page.getByRole("heading", { name: "Welcome to Resonant Landscapes" })).toHaveCount(0);
  }
}

async function moveToPoint(
  context: BrowserContext,
  page: Page,
  point: Coordinate,
  settleMs: number
) {
  // Pulse setGeolocation repeatedly so the app's 20-entry time-interpolated
  // position history fills with the target location. Without this, the smoothed
  // position stays near the previous park (stale history) for up to 15+ seconds.
  for (let i = 0; i < 25; i++) {
    await context.setGeolocation({ latitude: point[1], longitude: point[0] });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(settleMs);
}

async function getAudioDebug(page: Page) {
  return page.evaluate(() => window.__audioDebug ?? null) as Promise<AudioDebugState | null>;
}


test("mobile audio loads and plays for every debug map park", async ({ context, page, baseURL }, testInfo) => {
  test.skip(
    !["iphone-13", "pixel-7"].includes(testInfo.project.name),
    "This regression is only meant for the mobile Safari and Android projects."
  );
  test.setTimeout(8 * 60_000);

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const permissionOrigin = new URL(baseURL).origin;
  const expectedExtension = testInfo.project.name === "iphone-13" ? ".wav" : ".m4a";
  const runResults: ParkRunResult[] = [];
  const failures: string[] = [];
  const observedAudioRequests: { url: string; ts: number }[] = [];

  await context.route("https://resonant-landscapes.b-cdn.net/**", async (route) => {
    observedAudioRequests.push({
      url: route.request().url(),
      ts: Date.now(),
    });
    await route.continue();
  });

  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await moveToPoint(context, page, neutralPoint, 0);

  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");
  await dismissWelcomeIfPresent(page);

  const debugToggle = page.getByRole("button", { name: "Open" });
  await expect(debugToggle).toBeVisible({ timeout: 10_000 });
  await debugToggle.click();

  for (const park of debugParks) {
    const parkStartRequestIndex = observedAudioRequests.length;
    const heading = page.getByRole("heading", { name: park.name });
    let loadStartedAt = 0;
    let playStartedAt = 0;

    try {
      console.log(`[all-parks] entering ${park.name}`);
      loadStartedAt = Date.now();
      await moveToPoint(context, page, park.scaledCoords, centerSettleMs);
      await expect(heading).toBeVisible({ timeout: 15_000 });

      await expect
        .poll(async () => page.evaluate(() => window.__audioDebug ?? null), { timeout: loadTimeoutMs })
        .toMatchObject({
          hasBuffers: true,
          loadError: null,
        });

      const loadedAudioDebug = await getAudioDebug(page);
      console.log(
        `[all-parks] loaded ${park.name} in ${Date.now() - loadStartedAt - centerSettleMs}ms`
      );

      const playButton = page.locator('#secSource button[aria-label="Start playback"]').last();
      await expect(playButton).toBeVisible({ timeout: 15_000 });
      await playButton.scrollIntoViewIfNeeded();

      playStartedAt = Date.now();
      await playButton.click({ force: true });

      await page.waitForFunction(() => {
        const audioDebug = window.__audioDebug;
        return Boolean(
          audioDebug &&
            audioDebug.lastEvent === "playback-started" &&
            audioDebug.isPlaying &&
            audioDebug.hasSourceNode &&
            audioDebug.hasBuffers &&
            !audioDebug.loadError
        );
      }, null, { timeout: playTimeoutMs });
      console.log(
        `[all-parks] playback started ${park.name} in ${Date.now() - playStartedAt}ms`
      );

      await page.waitForTimeout(playbackHoldMs);

      const audioRequestUrls = observedAudioRequests
        .slice(parkStartRequestIndex)
        .map((request) => request.url)
        .filter((url) => url.includes(getExpectedSlug(park.name)));

      runResults.push({
        parkName: park.name,
        loadTimeMs: Date.now() - loadStartedAt - centerSettleMs,
        playStartTimeMs: Date.now() - playStartedAt,
        audioRequestUrls,
        audioRequestCount: audioRequestUrls.length,
        bufferDuration: loadedAudioDebug?.bufferDuration ?? null,
        bufferChannels: loadedAudioDebug?.bufferChannels ?? null,
        status: "passed",
        failureReason: null,
      });

      const stopButton = page.locator('#secSource button[aria-label="Stop playback"]').last();
      if (await stopButton.count()) {
        await stopButton.click({ force: true });
      }
    } catch (error) {
      const audioDebug = await getAudioDebug(page).catch(() => null);
      const audioRequestUrls = observedAudioRequests
        .slice(parkStartRequestIndex)
        .map((request) => request.url)
        .filter((url) => url.includes(getExpectedSlug(park.name)));
      const failureReason = error instanceof Error ? error.message : String(error);

      runResults.push({
        parkName: park.name,
        loadTimeMs: loadStartedAt ? Date.now() - loadStartedAt - centerSettleMs : null,
        playStartTimeMs: playStartedAt ? Date.now() - playStartedAt : null,
        audioRequestUrls,
        audioRequestCount: audioRequestUrls.length,
        bufferDuration: audioDebug?.bufferDuration ?? null,
        bufferChannels: audioDebug?.bufferChannels ?? null,
        status: "failed",
        failureReason,
      });

      failures.push(`${park.name}: ${failureReason}`);
      console.error(
        `[all-parks] failed ${park.name}`,
        JSON.stringify(
          {
            failureReason,
            loadError: audioDebug?.loadError ?? null,
            lastEvent: audioDebug?.lastEvent ?? null,
            hasBuffers: audioDebug?.hasBuffers ?? null,
            isPlaying: audioDebug?.isPlaying ?? null,
            audioRequestUrls,
          },
          null,
          2
        )
      );

      const stopButton = page.locator('#secSource button[aria-label="Stop playback"]').last();
      if (await stopButton.count()) {
        await stopButton.click({ force: true }).catch(() => undefined);
      }
    }
  }

  const report = {
    project: testInfo.project.name,
    generatedAt: new Date().toISOString(),
    totalParks: debugParks.length,
    passed: runResults.filter((result) => result.status === "passed").length,
    failed: runResults.filter((result) => result.status === "failed").length,
    results: runResults,
  };

  const reportPath = testInfo.outputPath(`all-parks-audio-${testInfo.project.name}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await testInfo.attach(`all-parks-audio-${testInfo.project.name}`, {
    path: reportPath,
    contentType: "application/json",
  });

  expect(failures, JSON.stringify(report, null, 2)).toEqual([]);
  expect(runResults.every((result) => result.audioRequestCount >= 2)).toBeTruthy();
  expect(runResults.every((result) => result.audioRequestUrls.every((url) => url.endsWith(expectedExtension)))).toBeTruthy();
});
