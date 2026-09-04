/**
 * Worst-case mobile audio regression under throttled network conditions.
 * Picks the heaviest park payload, exercises the prefetch/load path, and
 * asserts playback still starts within reasonable timing bounds.
 */
import { expect, test } from "@playwright/test";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { scaleCoordinates } from "../src/utils/geo.js";
import { formatParkSlug, getParkAudioVariants } from "../src/utils/audioPaths.js";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";
import { expectParkLabelVisible } from "./helpers/ui-assertions";
import { skipIfRoutingSawNothing, skipIfWorkerControlsPage } from "./helpers/service-worker";

// The ?debug query is load-bearing here. Every assertion in this spec reads
// window.__audioDebug, and a production build gates that mirror behind
// ?debug (production-surfaces.spec.ts asserts the gate), so run against a
// deploy preview without the query this spec fails no matter what the app
// does — rl-our. In dev the flag changes nothing: the mirror is always on.
const replayPath = "/?debug";
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

// Headroom over the theoretical transfer time, and a floor so a small payload
// still gets a usable budget. The Pixel profile throttles to 1.6 Mbps, so the
// heaviest park (~10.6 MB) legitimately needs ~53 s — a fixed 30/45 s timeout
// fails a load that is working exactly as designed.
const TRANSFER_SLACK = 1.6;
const MIN_LOAD_TIMEOUT_MS = 30_000;

/**
 * How long the audio payload should take to arrive under whichever slowdown
 * this project uses: emulated bandwidth plus per-request latency on throttled
 * chromium, or the fixed per-request delay everywhere else.
 */
function expectedTransferMs(
  totalBytes: number,
  requestCount: number,
  isThrottled: boolean
) {
  if (!isThrottled) {
    return requestCount * webkitRequestDelayMs;
  }

  const bytesMs = (totalBytes / networkProfile.downloadThroughput) * 1_000;
  return bytesMs + requestCount * networkProfile.latency;
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

/**
 * Sizes payloads from inside the page, the way the app itself fetches them.
 *
 * The previous node-side HEAD — request.fetch on the APIRequestContext — ran
 * with node's own CA bundle, which on at least one machine cannot verify the
 * CDN's legacy cross-signed chain and fails with UNABLE_TO_GET_ISSUER_CERT
 * while every browser on the same machine verifies the host fine (rl-9ek.2).
 * An in-page fetch uses the browser's trust store, so no machine needs
 * NODE_EXTRA_CA_CERTS, and the bytes counted are the bytes the app's own
 * runtime would see. The CDN exposes Content-Length through
 * access-control-expose-headers — the app's own cache index already reads it
 * (offlineAudioCache writeThrough) — and HEAD needs no CORS preflight.
 *
 * That exposure is the one thing an in-page probe depends on that a node-side
 * one did not, so it is checked rather than defaulted. A header that stops
 * being readable would otherwise size every park at zero, and since the
 * largest-park reduce compares totalBytes with `>`, every park tying at zero
 * makes the first one in stateParks.json the "worst case" — a spec that keeps
 * passing while measuring a payload nobody chose.
 */
async function measureContentLengths(
  page: import("@playwright/test").Page,
  urls: string[]
) {
  return page.evaluate(async (probeUrls: string[]) => {
    return Promise.all(
      probeUrls.map(async (url) => {
        const response = await fetch(url, { method: "HEAD" });
        if (!response.ok) {
          throw new Error(`HEAD ${url} failed with ${response.status}`);
        }
        const header = response.headers.get("content-length");
        if (header === null) {
          throw new Error(
            `HEAD ${url} returned no readable content-length. The CDN must name it in ` +
            "access-control-expose-headers for an in-page probe to read it."
          );
        }
        const bytes = Number(header);
        if (!Number.isFinite(bytes) || bytes <= 0) {
          throw new Error(`HEAD ${url} reported content-length "${header}", which is not a payload size.`);
        }
        return bytes;
      })
    );
  }, urls);
}

async function resolveWorstCasePark(
  page: import("@playwright/test").Page,
  userAgent: string
) {
  const candidates = stateParks.map((park) => {
    const variants = getParkAudioVariants(park.name, stateParks, userAgent);
    const urls = variants?.[0];
    if (!urls) {
      throw new Error(`Missing audio variants for ${park.name}`);
    }

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
    };
  });

  const lengths = await measureContentLengths(
    page,
    candidates.flatMap((candidate) => candidate.urls)
  );

  const parkCandidates = candidates.map((candidate, index) => {
    const [eightChannelBytes, monoBytes] = [lengths[index * 2], lengths[index * 2 + 1]];
    return {
      ...candidate,
      eightChannelBytes,
      monoBytes,
      totalBytes: eightChannelBytes + monoBytes,
    };
  });

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
    // The sizing probes are the test's own traffic, not the walk's: HEADs the
    // page issues to measure payloads before the worst case is chosen. Let
    // them pass unrecorded and undelayed by this handler, so the recorder
    // stays a record of what the walk fetched and skipIfRoutingSawNothing
    // keeps its meaning. By this handler only: on throttled chromium the CDP
    // emulation is beneath Playwright's routing, so these still pay its
    // latency — about a second across the 26 probes, all of it spent before
    // the measured window opens.
    if (route.request().method() === "HEAD") {
      await route.continue();
      return;
    }

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

  await seedOrientationPermission(page);
  await context.grantPermissions(["geolocation"], { origin: permissionOrigin });
  await context.setGeolocation(neutralPoint);

  console.log(`[worst-case] navigating to ${replayPath}`);
  await page.goto(replayPath);
  await page.waitForLoadState("domcontentloaded");
  console.log("[worst-case] page loaded");
  await dismissWelcomeModal(page);

  // The service worker hides the network from WebKit routing, which would
  // make every measurement below fiction. Verified 2026-09-03 against a
  // production preview: zero routed requests, a 6 ms prefetch, buffers
  // already resident. The controller is only knowable once the page has
  // loaded, which is why this sits below goto. It is a cheap early exit, not
  // a guarantee — see the recorder check before the assertions, which is the
  // half that cannot be raced.
  await skipIfWorkerControlsPage(page, browserName);

  const userAgent = await page.evaluate(() => navigator.userAgent);
  console.log("[worst-case] resolving largest audio payload park");
  const worstCasePark = await resolveWorstCasePark(page, userAgent);
  console.log(
    `[worst-case] selected park=${worstCasePark.name} totalBytes=${worstCasePark.totalBytes}`
  );
  const expectedLoadMs = expectedTransferMs(
    worstCasePark.totalBytes,
    worstCasePark.urls.length,
    shouldUseChromiumThrottling
  );
  const loadBudgetMs = Math.max(
    MIN_LOAD_TIMEOUT_MS,
    Math.ceil(expectedLoadMs * TRANSFER_SLACK)
  );
  console.log(
    `[worst-case] expectedLoadMs=${Math.round(expectedLoadMs)} loadBudgetMs=${loadBudgetMs}`
  );

  // The config-wide 90 s timeout cannot cover a payload that legitimately takes
  // ~53 s to arrive: this test waits out the budget twice (prefetch, then the
  // active load) plus navigation, geolocation settling, and playback start.
  test.setTimeout(loadBudgetMs * 2 + 60_000);

  const prefetchPoint = offsetPointByMeters(worstCasePark.scaledCoords, 22, 0);
  const outerApproachPoint = offsetPointByMeters(worstCasePark.scaledCoords, 65, 0);

  console.log("[worst-case] moving to outer approach point");
  await moveToPoint(context, page, outerApproachPoint, 250);

  const prefetchStartedAt = Date.now();
  console.log("[worst-case] moving to prefetch point");
  await moveToPoint(context, page, prefetchPoint, 800);
  const prefetchResult = await waitForSuccessfulPrefetch(page, loadBudgetMs);
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

  await expect.poll(async () => page.evaluate(() => window.__audioDebug?.uiStatus ?? null), {
    timeout: 15_000,
  }).toMatch(/^(preparing|playing)$/);
  console.log("[worst-case] loading or playback state reached");

  await expect.poll(async () => page.evaluate(() => window.__audioDebug ?? null), {
    timeout: loadBudgetMs,
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
  // The park loaded and played, so requests were made. An empty recorder now
  // means a worker claimed the page after the check above and the network
  // went somewhere this test cannot see: skip rather than assert on nothing.
  skipIfRoutingSawNothing(observedAudioRequests.length, browserName);

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
      expectedLoadMs,
      loadBudgetMs,
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
  expect(loadCompletedAt - loadStartedAt).toBeLessThan(loadBudgetMs);
  expect(playbackStartedAt - playStartedAt).toBeLessThan(5_000);
});
