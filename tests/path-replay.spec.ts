import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type ReplayPoint = {
  latitude: number;
  longitude: number;
  waitMs?: number;
  label?: string;
};

const DEFAULT_PATH_FILE = "tests/paths/sica-hollow-approach.json";
const defaultStepMs = Number(process.env.PATH_REPLAY_STEP_MS ?? 1500);
const finalHoldMs = Number(process.env.PATH_REPLAY_FINAL_HOLD_MS ?? 6000);
const custerHoldMs = Number(process.env.PATH_REPLAY_CUSTER_HOLD_MS ?? 4000);
const pauseAtPark = process.env.PATH_REPLAY_PAUSE === "1";

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

test("replays a geolocation path on the map", async ({ context, page, baseURL }) => {
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
    latitude: firstPoint.latitude,
    longitude: firstPoint.longitude,
  });

  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");

  const continueButton = page.getByRole("button", { name: "Continue" });
  if (await continueButton.count()) {
    await continueButton.click();
    await expect(page.getByRole("heading", { name: "Welcome to Resonant Landscapes" })).toHaveCount(0);
  }

  const debugToggle = page.getByRole("button", { name: "Open" });
  await expect(debugToggle).toBeVisible({ timeout: 10_000 });
  await debugToggle.click();
  console.log("[test] opened debug panel");

  console.log(
    `[test] re-applying first point after load: ${firstPoint.label ?? "unnamed"} (${firstPoint.latitude}, ${firstPoint.longitude})`
  );
  await context.setGeolocation({
    latitude: firstPoint.latitude,
    longitude: firstPoint.longitude,
  });
  await page.waitForTimeout(firstPoint.waitMs ?? defaultStepMs);

  const parkDebug = page.locator("p", { hasText: "Park:" });
  await expect(parkDebug).toContainText("Custer Test", { timeout: 15_000 });
  console.log("[test] debug panel reports park: Custer Test");

  const parkLabel = page.getByRole("heading", { name: "Custer Test" });
  await expect(parkLabel).toBeVisible({ timeout: 15_000 });
  console.log("[test] detected modal heading: Custer Test");

  const playButton = page.getByRole("button", { name: "Start playback" });
  await expect(playButton).toBeVisible({ timeout: 15_000 });
  console.log("[test] clicking play at Custer Test");
  await playButton.click();

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
  }, null, { timeout: 15_000 });

  console.log(`[test] holding at Custer Test for ${custerHoldMs}ms`);
  await page.waitForTimeout(custerHoldMs);

  const stopButton = page.getByRole("button", { name: "Stop playback" });
  if (await stopButton.count()) {
    console.log("[test] stopping playback before leaving Custer Test");
    await stopButton.click();
  }

  for (const [index, point] of replayPoints.slice(1).entries()) {
    console.log(
      `[test] replay point ${index + 2}/${replayPoints.length}: ${point.label ?? "unnamed"} (${point.latitude}, ${point.longitude}) wait=${point.waitMs ?? defaultStepMs}ms`
    );
    await context.setGeolocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    await page.waitForTimeout(point.waitMs ?? defaultStepMs);
  }

  const sicaLabel = page.getByRole("heading", { name: "Sica Hollow State Park" });
  await expect(sicaLabel).toBeVisible({ timeout: 15_000 });
  console.log("[test] detected park label: Sica Hollow State Park");

  await expect(playButton).toBeVisible({ timeout: 15_000 });

  if (pauseAtPark) {
    await page.pause();
  }

  await playButton.click();

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
  }, null, { timeout: 15_000 });

  await expect.poll(async () => {
    return page.evaluate(() => window.__audioDebug ?? null);
  }).toMatchObject({
    lastEvent: "playback-started",
    isPlaying: true,
    hasSourceNode: true,
    hasBuffers: true,
    loadError: null,
  });

  await page.screenshot({
    path: "test-results/path-replay-playing-audio.png",
    fullPage: true,
  });

  await page.waitForTimeout(finalHoldMs);
});
