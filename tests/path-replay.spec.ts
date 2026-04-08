import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

type ReplayPoint = {
  latitude: number;
  longitude: number;
  waitMs?: number;
};

const DEFAULT_PATH_FILE = "tests/paths/sica-hollow-approach.json";
const defaultStepMs = Number(process.env.PATH_REPLAY_STEP_MS ?? 1500);
const finalHoldMs = Number(process.env.PATH_REPLAY_FINAL_HOLD_MS ?? 6000);

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

  for (const point of replayPoints) {
    await context.setGeolocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    await page.waitForTimeout(point.waitMs ?? defaultStepMs);
  }

  await page.waitForTimeout(finalHoldMs);
});
