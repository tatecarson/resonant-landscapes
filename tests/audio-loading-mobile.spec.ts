import { expect, test } from "@playwright/test";

const replayPath = "/resonant-landscapes/#/debug";
const firstPoint = {
  latitude: 44.012224,
  longitude: -97.112994,
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
  const expectedFolder = testInfo.project.name === "iphone-13" ? "sounds-wav" : "sounds";
  const expectedExtension = testInfo.project.name === "iphone-13" ? ".wav" : ".m4a";
  const audioRequests: string[] = [];

  await context.route("https://resonant-landscapes.b-cdn.net/**", async (route) => {
    const url = route.request().url();
    audioRequests.push(url);

    if (url.includes("Custer-Test")) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    await route.continue();
  });

  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(firstPoint);

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

  const custerHeading = page.getByRole("heading", { name: "Custer Test" });
  await expect(custerHeading).toBeVisible({ timeout: 15_000 });

  for (const point of replayPoints) {
    await context.setGeolocation({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    await page.waitForTimeout(point.waitMs);
  }

  const sicaHeading = page.getByRole("heading", { name: "Sica Hollow State Park" });
  await expect(sicaHeading).toBeVisible({ timeout: 15_000 });

  await expect.poll(async () => {
    return page.evaluate(() => window.__audioDebug ?? null);
  }, { timeout: 15_000 }).toMatchObject({
    hasBuffers: true,
    loadError: null,
  });

  const playButton = page.getByRole("button", { name: "Start playback" });
  await expect(playButton).toBeVisible({ timeout: 15_000 });
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

  const sicaRequests = audioRequests.filter((url) => url.includes("Sica-Hollow"));
  expect(sicaRequests).toHaveLength(2);
  expect(sicaRequests.every((url) => url.includes(`/${expectedFolder}/`))).toBeTruthy();
  expect(sicaRequests.every((url) => url.endsWith(expectedExtension))).toBeTruthy();

  const custerRequests = audioRequests.filter((url) => url.includes("Custer-Test"));
  expect(custerRequests).toHaveLength(2);
});
