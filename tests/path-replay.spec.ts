import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type ReplayPoint = {
  latitude: number;
  longitude: number;
  waitMs?: number;
};

const DEFAULT_PATH_FILE = "tests/paths/sica-hollow-approach.json";
const defaultStepMs = Number(process.env.PATH_REPLAY_STEP_MS ?? 1500);
const finalHoldMs = Number(process.env.PATH_REPLAY_FINAL_HOLD_MS ?? 6000);
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
  const replayPoints = await readReplayPoints();
  const firstPoint = replayPoints[0];

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  await context.grantPermissions(["geolocation"], { origin: baseURL });
  await context.setGeolocation({
    latitude: firstPoint.latitude,
    longitude: firstPoint.longitude,
  });

  await page.goto("/resonant-landscapes/");
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Resonant Landscapes" })).toHaveCount(0);

  for (const point of replayPoints) {
    await context.setGeolocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    await page.waitForTimeout(point.waitMs ?? defaultStepMs);
  }

  const playButton = page.getByRole("button", { name: "Start playback" });
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
