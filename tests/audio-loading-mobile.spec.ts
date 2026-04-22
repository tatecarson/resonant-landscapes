/**
 * Regression for the "latest park wins" audio-loading race on mobile.
 * Starts at Hartford Beach, moves quickly to Sica Hollow, and verifies the app
 * ends up loading and playing the final park's audio instead of the stale one.
 */
import { expect, test } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";
import { expectParkLabelVisible } from "./helpers/ui-assertions";

const replayPath = "/";
const firstPoint = {
  latitude: 44.01320393,
  longitude: -97.11059202,
};
const replayPoints = [
  { latitude: 44.013000, longitude: -97.110649, waitMs: 250 },
  { latitude: 44.013120, longitude: -97.110649, waitMs: 250 },
  { latitude: 44.013220, longitude: -97.110649, waitMs: 250 },
  { latitude: 44.013290, longitude: -97.110649, waitMs: 300 },
  { latitude: 44.013330, longitude: -97.110649, waitMs: 500 },
  { latitude: 44.013350, longitude: -97.110649, waitMs: 750 },
  { latitude: 44.013364, longitude: -97.110649, waitMs: 1500 },
];

test("mobile audio loading stays on the latest park for Safari and Android", async ({
  context,
  page,
  baseURL,
}, testInfo) => {
  test.skip(
    !["iphone-13", "pixel-7"].includes(testInfo.project.name),
    "This regression is only meant for the mobile Safari and Android projects."
  );

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const permissionOrigin = new URL(baseURL).origin;
  const isIphone = testInfo.project.name === "iphone-13";
  const expectedSpatialPattern = isIphone
    ? /\/sounds-flac\/.+_8ch\.flac$/
    : /\/sounds\/.+_8ch\.m4a$/;
  const expectedMonoPattern = isIphone
    ? /\/sounds-wav\/.+_mono\.wav$/
    : /\/sounds\/.+_mono\.m4a$/;
  const audioRequests: string[] = [];

  await context.route("https://resonant-landscapes.b-cdn.net/**", async (route) => {
    const url = route.request().url();
    audioRequests.push(url);

    if (url.includes("Hartford-Beach")) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    await route.continue();
  });

  await seedOrientationPermission(page);
  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(firstPoint);

  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");
  await dismissWelcomeModal(page);

  await expectParkLabelVisible(page, "Hartford Beach State Park");

  for (const point of replayPoints) {
    await context.setGeolocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    await page.waitForTimeout(point.waitMs);
  }

  await expectParkLabelVisible(page, "Sica Hollow State Park");

  await expect.poll(async () => {
    return page.evaluate(() => window.__audioDebug?.uiStatus ?? null);
  }, { timeout: 15_000 }).not.toBe("idle");

  await expect.poll(async () => {
    return page.evaluate(() => window.__audioDebug ?? null);
  }, { timeout: 15_000 }).toMatchObject({
    isAudioUnlocked: true,
    hasBuffers: true,
    isPlaying: true,
    loadError: null,
    uiStatus: "playing",
  });

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

  const sicaRequests = audioRequests.filter((url) => url.includes("Sica-Hollow"));
  expect(sicaRequests).toHaveLength(2);
  expect(sicaRequests.some((url) => expectedSpatialPattern.test(url))).toBeTruthy();
  expect(sicaRequests.some((url) => expectedMonoPattern.test(url))).toBeTruthy();

  const hartfordRequests = audioRequests.filter((url) => url.includes("Hartford-Beach"));
  expect(hartfordRequests).toHaveLength(2);
});
