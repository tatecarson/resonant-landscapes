/**
 * Geolocation replay regression for map, park-transition, and walk-heading behavior.
 * This test owns the Hartford-to-Sica path flow and intentionally avoids
 * audio-specific assertions so audio regressions stay in the dedicated specs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";
import {
  dispatchDeviceOrientation,
  headingBetweenPoints,
  rotateDeviceOrientation,
  seedDeviceOrientationHarness,
} from "./helpers/device-orientation";
import { seedGeolocationHeadingShim } from "./helpers/geolocation-heading";
import { expectParkLabelVisible } from "./helpers/ui-assertions";

type ReplayPoint = {
  latitude: number;
  longitude: number;
  waitMs?: number;
  label?: string;
};

const DEFAULT_PATH_FILE = "tests/paths/sica-hollow-approach.json";
const defaultStepMs = Number(process.env.PATH_REPLAY_STEP_MS ?? 1500);
const finalHoldMs = Number(process.env.PATH_REPLAY_FINAL_HOLD_MS ?? 6000);
const initialHoldMs = Number(process.env.PATH_REPLAY_INITIAL_HOLD_MS ?? 4000);
const turnDurationMs = Number(process.env.PATH_REPLAY_TURN_MS ?? 600);
const turnStepDegrees = Number(process.env.PATH_REPLAY_TURN_STEP_DEG ?? 5);
const walkCadenceMs = Number(process.env.PATH_REPLAY_WALK_CADENCE_MS ?? 1000);
const pauseAtPark = process.env.PATH_REPLAY_PAUSE === "1";
const neutralPoint: ReplayPoint = {
  latitude: 44.0115,
  longitude: -97.1095,
  label: "Neutral start",
};

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

test("replays a walking path with matched device orientation and updates the active park", async ({
  context,
  page,
  baseURL,
}) => {
  test.setTimeout(600_000);
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
  const replayPath = "/";

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const permissionOrigin = new URL(baseURL).origin;

  console.log(`[test] baseURL=${baseURL}`);
  console.log(`[test] route=${replayPath}`);
  console.log(`[test] geolocation permission origin=${permissionOrigin}`);

  await seedDeviceOrientationHarness(page);
  await seedGeolocationHeadingShim(page);
  await seedOrientationPermission(page);
  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation({
    latitude: neutralPoint.latitude,
    longitude: neutralPoint.longitude,
  });

  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");

  await dismissWelcomeModal(page);
  console.log("[test] dismissed welcome modal");
  await expect(page.locator(".map .ol-zoom .ol-zoom-in")).toBeVisible({ timeout: 15_000 });

  const initialHeading = replayPoints[1] ? headingBetweenPoints(firstPoint, replayPoints[1]) : 0;
  console.log(
    `[test] re-applying first point after load: ${firstPoint.label ?? "unnamed"} (${firstPoint.latitude}, ${firstPoint.longitude}) heading=${initialHeading.toFixed(1)}°`
  );
  await expect
    .poll(
      async () => {
        await dispatchDeviceOrientation(page, initialHeading);
        await context.setGeolocation({ latitude: firstPoint.latitude, longitude: firstPoint.longitude });

        const heading = page.getByRole("heading", { name: "Hartford Beach State Park" });
        if (await heading.count()) {
          return "Hartford Beach State Park";
        }

        const compactLabel = page.locator("p.font-cormorant", { hasText: "Hartford Beach State Park" });
        return (await compactLabel.count()) > 0 ? "Hartford Beach State Park" : "";
      },
      { timeout: 15_000, intervals: [500] }
    )
    .toBe("Hartford Beach State Park");
  await expectParkLabelVisible(page, "Hartford Beach State Park");
  console.log("[test] park label visible: Hartford Beach State Park");

  console.log(`[test] holding at Hartford Beach State Park for ${initialHoldMs}ms`);
  await page.waitForTimeout(initialHoldMs);

  let currentHeading = initialHeading;

  for (const [index, point] of replayPoints.slice(1).entries()) {
    const previousPoint = replayPoints[index];
    const heading = headingBetweenPoints(previousPoint, point);
    const legMs = point.waitMs ?? defaultStepMs;

    console.log(
      `[test] replay point ${index + 2}/${replayPoints.length}: ${point.label ?? "unnamed"} (${point.latitude}, ${point.longitude}) heading=${heading.toFixed(1)}° (from ${currentHeading.toFixed(1)}°, turn=${turnDurationMs}ms) leg=${legMs}ms cadence=${walkCadenceMs}ms`
    );

    await rotateDeviceOrientation(page, currentHeading, heading, {
      durationMs: turnDurationMs,
      stepDegrees: turnStepDegrees,
    });
    currentHeading = heading;

    const steps = Math.max(1, Math.round(legMs / walkCadenceMs));
    const stepMs = legMs / steps;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const lat = previousPoint.latitude + (point.latitude - previousPoint.latitude) * t;
      const lon = previousPoint.longitude + (point.longitude - previousPoint.longitude) * t;
      await context.setGeolocation({ latitude: lat, longitude: lon });
      await page.waitForTimeout(stepMs);
    }

    if (point.label === "Sica approach 3") {
      await expect
        .poll(
          async () => {
            await dispatchDeviceOrientation(page, heading);
            await context.setGeolocation({ latitude: point.latitude, longitude: point.longitude });

            const currentHeading = page.getByRole("heading", { name: "Sica Hollow State Park" });
            if (await currentHeading.count()) {
              return "Sica Hollow State Park";
            }

            const compactLabel = page.locator("p.font-cormorant", { hasText: "Sica Hollow State Park" });
            return (await compactLabel.count()) > 0 ? "Sica Hollow State Park" : "";
          },
          { timeout: 15_000, intervals: [500] }
        )
        .toBe("Sica Hollow State Park");
      console.log("[test] selected park at overlap point: Sica Hollow State Park");
      console.log(
        `[test] walk heading preview at overlap is ${heading.toFixed(1)}° toward ${point.label ?? "unnamed"}`
      );
    }
  }

  await expectParkLabelVisible(page, "Sica Hollow State Park");
  console.log("[test] detected park label: Sica Hollow State Park");

  await page.evaluate(() => {
    const alphaStep = 2;
    let alpha = 0;

    const tick = () => {
      (window as Window & {
        __dispatchDeviceOrientation: (nextAlpha: number, beta: number, gamma: number) => void;
      }).__dispatchDeviceOrientation(alpha, -90, 0);
      alpha = (alpha + alphaStep) % 360;
      window.setTimeout(tick, 32);
    };

    tick();
  });
  console.log("[test] continuous walk-orientation preview running at Sica Hollow");

  if (pauseAtPark) {
    await page.pause();
  }

  await page.screenshot({
    path: "test-results/path-replay-arrived-at-sica.png",
    fullPage: true,
  });

  await page.waitForTimeout(finalHoldMs);
});
