/// <reference path="../src/vite-env.d.ts" />
/**
 * Worst-case mobile audio regression under throttled network conditions.
 * Picks the heaviest park payload, exercises the prefetch/load path, and
 * asserts playback still starts within reasonable timing bounds.
 */
import { expect, test } from "@playwright/test";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { scaleCoordinates } from "../src/utils/geo.js";
import { formatParkSlug, getParkAudioVariants } from "../src/utils/audioPaths.js";

const replayPath = "/#/debug";
const neutralPoint = {
  latitude: 44.0142,
  longitude: -97.1098,
};
const scaleLat = 0.00066;
const scaleLong = 0.00045;
const referencePoint: [number, number] = [-97.110789, 44.012222];

const networkProfile = {
  offline: false,
  latency: 150,
  downloadThroughput: 1_600_000 / 8,
  uploadThroughput: 750_000 / 8,
  connectionType: "cellular4g" as const,
};
const webkitRequestDelayMs = Number(process.env.WORST_CASE_WEBKIT_REQUEST_DELAY_MS ?? 1_500);

async function expectParkLabelVisible(
  page: import("@playwright/test").Page,
  parkName: string
) {
  const heading = page.getByRole("heading", { name: parkName });
  if (await heading.count()) {
    await expect(heading).toBeVisible({ timeout: 15_000 });
    return;
  }

  const compactLabel = page.locator("p.font-cormorant", { hasText: parkName });
  await expect(compactLabel).toBeVisible({ timeout: 15_000 });
}

async function expectAudioStatusVisible(
  page: import("@playwright/test").Page,
  statusLabel: string
) {
  const status = page.locator("p.font-space-mono", { hasText: statusLabel });
  await expect(status.first()).toBeVisible({ timeout: 15_000 });
}

async function dismissWelcomeIfPresent(page: import("@playwright/test").Page) {
  const beginButton = page.getByRole("button", { name: "Begin" });
  if (await beginButton.count()) {
    await beginButton.click();
    await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toHaveCount(0);
  }
}

async function moveToPoint(
  context: import("@playwright/test").BrowserContext,
  page: import("@playwright/test").Page,
  point: { latitude: number; longitude: number },
  settleMs = 300
) {
  for (let i = 0; i < 25; i += 1) {
    await context.setGeolocation(point);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(settleMs);
}

function offsetPointByMeters(
  point: { latitude: number; longitude: number },
  northMeters: number,
  eastMeters: number
) {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude = 111_320 * Math.cos((point.latitude * Math.PI) / 180);

  return {
    latitude: point.latitude + northMeters / metersPerDegreeLatitude,
    longitude: point.longitude + eastMeters / metersPerDegreeLongitude,
  };
}

async function getContentLength(
  request: import("@playwright/test").APIRequestContext,
  url: string
) {
  const response = await request.fetch(url, { method: "HEAD" });
  if (!response.ok()) {
    throw new Error(`HEAD ${url} failed with ${response.status()}`);
  }

  const contentLengthHeader = response.headers()["content-length"];
  return Number(contentLengthHeader ?? 0);
}

async function resolveWorstCasePark(
  request: import("@playwright/test").APIRequestContext,
  userAgent: string
) {
  const parkCandidates = await Promise.all(
    stateParks.map(async (park) => {
      const variants = getParkAudioVariants(park.name, stateParks, userAgent);
      const urls = variants?.[0];
      if (!urls) {
        throw new Error(`Missing audio variants for ${park.name}`);
      }

      const [eightChannelUrl, monoUrl] = urls;
      const [eightChannelBytes, monoBytes] = await Promise.all([
        getContentLength(request, eightChannelUrl),
        getContentLength(request, monoUrl),
      ]);
      const [scaledLongitude, scaledLatitude] = scaleCoordinates(
        park.cords as [number, number],
        referencePoint,
        scaleLong,
        scaleLat
      );

      return {
        name: park.name,
        slug: formatParkSlug(park.name),
        scaledCoords: {
          latitude: scaledLatitude,
          longitude: scaledLongitude,
        },
        urls,
        totalBytes: eightChannelBytes + monoBytes,
        eightChannelBytes,
        monoBytes,
      };
    })
  );

  const largestPark = parkCandidates.reduce((largest, candidate) => {
    if (!largest || candidate.totalBytes > largest.totalBytes) {
      return candidate;
    }
    return largest;
  }, null as (typeof parkCandidates)[number] | null);

  if (!largestPark) {
    throw new Error("Could not resolve a worst-case park candidate.");
  }

  return largestPark;
}

function showsSuccessfulPrefetch(audioDebug: (Window["__audioDebug"] | null | undefined)) {
  if (!audioDebug) {
    return false;
  }

  if (audioDebug.lastLoadReason === "prefetch") {
    return true;
  }

  return (
    audioDebug.lastLoadReason === "active-load" &&
    audioDebug.lastLoadCacheHit === true &&
    audioDebug.cacheEntries > 0
  );
}

async function waitForSuccessfulPrefetch(
  page: import("@playwright/test").Page,
  timeoutMs: number
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const audioDebug = await page.evaluate(() => window.__audioDebug ?? null);
    if (showsSuccessfulPrefetch(audioDebug)) {
      return {
        didPrefetch: true,
        audioDebug,
        waitedMs: Date.now() - startedAt,
      };
    }

    await page.waitForTimeout(250);
  }

  return {
    didPrefetch: false,
    audioDebug: await page.evaluate(() => window.__audioDebug ?? null),
    waitedMs: Date.now() - startedAt,
  };
}

test("worst-case park audio loads under throttled mobile network conditions", async ({
  context,
  page,
  baseURL,
  browserName,
  request,
}, testInfo) => {
  console.log(`[worst-case] starting test for project=${testInfo.project.name} browser=${browserName}`);
  test.skip(
    !["pixel-7", "iphone-13"].includes(testInfo.project.name),
    "This regression is only meant for the mobile Pixel and iPhone projects."
  );

  if (!baseURL) {
    throw new Error("Missing Playwright baseURL.");
  }

  const permissionOrigin = new URL(baseURL).origin;
  const observedAudioRequests: { url: string; start: number; end: number | null }[] = [];
  const shouldUseChromiumThrottling = testInfo.project.name === "pixel-7" && browserName === "chromium";

  if (shouldUseChromiumThrottling) {
    const cdpSession = await context.newCDPSession(page);
    console.log("[worst-case] enabling chromium network throttling");
    await cdpSession.send("Network.enable");
    await cdpSession.send("Network.emulateNetworkConditions", networkProfile);
  } else {
    console.log(
      `[worst-case] using delayed audio responses for ${testInfo.project.name} (${webkitRequestDelayMs}ms/request)`
    );
  }

  await context.route("https://resonant-landscapes.b-cdn.net/**", async (route) => {
    observedAudioRequests.push({
      url: route.request().url(),
      start: Date.now(),
      end: null,
    });

    if (!shouldUseChromiumThrottling) {
      await page.waitForTimeout(webkitRequestDelayMs);
    }

    await route.continue();
  });

  page.on("response", async (response) => {
    const request = observedAudioRequests.find((entry) => entry.url === response.url() && entry.end === null);
    if (request) {
      request.end = Date.now();
    }
  });

  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(neutralPoint);

  console.log(`[worst-case] navigating to ${replayPath}`);
  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");
  console.log("[worst-case] page loaded");
  await dismissWelcomeIfPresent(page);
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("#/debug");
  console.log("[worst-case] confirmed debug route");

  const userAgent = await page.evaluate(() => navigator.userAgent);
  console.log("[worst-case] resolving largest audio payload park");
  const worstCasePark = await resolveWorstCasePark(request, userAgent);
  console.log(
    `[worst-case] selected park=${worstCasePark.name} totalBytes=${worstCasePark.totalBytes}`
  );
  const prefetchPoint = offsetPointByMeters(worstCasePark.scaledCoords, 22, 0);
  const outerApproachPoint = offsetPointByMeters(worstCasePark.scaledCoords, 65, 0);

  const debugToggle = page.getByRole("button", { name: "Open" });
  if (await debugToggle.count()) {
    await expect(debugToggle).toBeVisible({ timeout: 10_000 });
    await debugToggle.click();
    console.log("[worst-case] opened debug panel");
  }

  const unlockAudioButton = page.getByRole("button", { name: "Unlock Audio" });
  if (await unlockAudioButton.count()) {
    await unlockAudioButton.click();
    console.log("[worst-case] unlocked audio");
  }

  console.log("[worst-case] moving to outer approach point");
  await moveToPoint(context, page, outerApproachPoint, 250);

  const prefetchStartedAt = Date.now();
  console.log("[worst-case] moving to prefetch point");
  await moveToPoint(context, page, prefetchPoint, 800);
  const prefetchResult = await waitForSuccessfulPrefetch(page, 30_000);
  const prefetchDebug = prefetchResult.audioDebug;
  const prefetchCompletedAt = Date.now();
  console.log(
    `[worst-case] prefetch complete didPrefetch=${prefetchResult.didPrefetch} waitedMs=${prefetchResult.waitedMs}`
  );

  const loadStartedAt = Date.now();
  console.log("[worst-case] moving into park");
  await moveToPoint(context, page, worstCasePark.scaledCoords, 300);

  await expectParkLabelVisible(page, worstCasePark.name);
  console.log("[worst-case] park modal visible");

  await expectAudioStatusVisible(page, "Preparing audio");
  console.log("[worst-case] preparing state visible");

  await expect.poll(async () => page.evaluate(() => window.__audioDebug ?? null), {
    timeout: 45_000,
  }).toMatchObject({
    hasBuffers: true,
    loadError: null,
  });
  console.log("[worst-case] buffers loaded");

  const loadCompletedAt = Date.now();

  const playStartedAt = Date.now();
  console.log("[worst-case] waiting for autoplay");

  await page.waitForFunction(() => {
    const audioDebug = window.__audioDebug;
    return Boolean(
      audioDebug &&
        audioDebug.isAudioUnlocked &&
        audioDebug.lastEvent === "playback-started" &&
        audioDebug.isPlaying &&
        audioDebug.hasSourceNode &&
        audioDebug.hasBuffers &&
        !audioDebug.loadError
    );
  }, null, { timeout: 20_000 });

  const playbackStartedAt = Date.now();
  console.log(
    `[worst-case] playback started loadMs=${loadCompletedAt - loadStartedAt} autoplayStartMs=${playbackStartedAt - playStartedAt}`
  );
  const relevantRequests = observedAudioRequests.filter((request) => request.url.includes(worstCasePark.slug));
  const audioDebug = await page.evaluate(() => window.__audioDebug ?? null);
  const renderDebug = await page.evaluate(() => window.__renderDebug ?? null);
  console.log("[worst-case] render counts:", JSON.stringify(renderDebug, null, 2));

  await testInfo.attach("worst-case-audio-metrics", {
    body: JSON.stringify({
      parkName: worstCasePark.name,
      worstCaseUrls: worstCasePark.urls,
      totalBytes: worstCasePark.totalBytes,
      eightChannelBytes: worstCasePark.eightChannelBytes,
      monoBytes: worstCasePark.monoBytes,
      networkProfile,
      prefetchPoint,
      outerApproachPoint,
      didPrefetchBeforeParkEntry: prefetchResult.didPrefetch,
      prefetchWaitedMs: prefetchResult.waitedMs,
      prefetchDurationMs: prefetchCompletedAt - prefetchStartedAt,
      prefetchDebug,
      loadDurationMs: loadCompletedAt - loadStartedAt,
      playbackStartDurationMs: playbackStartedAt - playStartedAt,
      audioDebug,
      relevantRequests,
    }, null, 2),
    contentType: "application/json",
  });

  expect(relevantRequests.length).toBeGreaterThanOrEqual(2);
  expect(audioDebug?.activeUrls?.every((url: string) => url.includes(worstCasePark.slug))).toBeTruthy();
  expect(audioDebug?.lastLoadReason).toBeTruthy();
  expect(audioDebug?.uiStatus).toBe("playing");
  expect(showsSuccessfulPrefetch(audioDebug) || showsSuccessfulPrefetch(prefetchDebug)).toBeTruthy();
  expect(loadCompletedAt - loadStartedAt).toBeLessThan(30_000);
  expect(playbackStartedAt - playStartedAt).toBeLessThan(5_000);
});
