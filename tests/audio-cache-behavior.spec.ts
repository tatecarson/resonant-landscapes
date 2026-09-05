/**
 * The two behaviours the buffer cache and abortable loader exist for, which
 * were previously only checkable by walking a park with a laptop attached:
 *
 *   - a prefetch that is no longer wanted stops consuming bandwidth
 *   - re-entering a recent park replays from cache instead of downloading
 *
 * Both are driven from geolocation, so they automate cleanly. The abort test
 * also asserts the request was genuinely cancelled at the network layer, which
 * is invisible in the field.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

// DSU-scaled positions. Hartford Beach and Sica Hollow sit ~5 m apart, close
// enough that moving between them retargets the prefetch.
const HARTFORD: [number, number] = [44.01320393348, -97.11059202645];
const SICA: [number, number] = [44.01336371948, -97.11064914495];
// ~180 m south: outside every park's 40 m prefetch range.
const FAR_AWAY: [number, number] = [44.01150129188, -97.11064253895];

const audioDebug = (page: Page) => page.evaluate(() => window.__audioDebug ?? null);

// The ?debug query is load-bearing here. Three tests read audioDebug(), which
// is window.__audioDebug — a mirror a production build gates behind the query
// (src/config/debug.ts), so on the bare path those reads return undefined and
// the polls run out against a deploy preview no matter what the app does —
// rl-9ek.5. In dev the flag changes nothing: the mirror is always on. The
// prefetch-abort test reads nothing the flag touches but navigates through
// the same startWalk, so it goes along.
const mapPath = "/?debug";

/**
 * WebKit only emits geolocation on change and will not replay a fix set before
 * the map's watch registered, so nudge until the app reacts.
 */
async function walkTo(
  context: BrowserContext,
  page: Page,
  [latitude, longitude]: [number, number],
  settleMs = 1200
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await context.setGeolocation({
      latitude: latitude + attempt * 1e-7,
      longitude,
    });
    await page.waitForTimeout(settleMs / 3);
  }
  await page.waitForTimeout(settleMs);
}

async function startWalk(context: BrowserContext, page: Page, from: [number, number]) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: from[0], longitude: from[1] });
  await seedOrientationPermission(page);
  await page.goto(mapPath);
  await dismissWelcomeModal(page);
}

test("a prefetch that is no longer wanted stops downloading", async ({ context, page }) => {
  // Hold the audio responses open so a retarget is guaranteed to land while
  // the first park's download is still in flight.
  const inFlight: string[] = [];
  const cancelled: string[] = [];

  await page.route(/b-cdn\.net\/sounds/, async (route) => {
    inFlight.push(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, 90_000));
    await route.abort();
  });
  page.on("requestfailed", (request) => {
    if (/b-cdn\.net\/sounds/.test(request.url())) cancelled.push(request.url());
  });

  await startWalk(context, page, FAR_AWAY);

  // Into Hartford Beach's prefetch range: its download starts and hangs.
  await walkTo(context, page, HARTFORD);
  await expect.poll(() => inFlight.length, { timeout: 20_000 }).toBeGreaterThan(0);

  // Retarget to a different park while that download is still open.
  await walkTo(context, page, SICA, 2000);

  // The abandoned request must actually be cancelled, not merely ignored.
  // 25 s window against a 90 s hold: only the app aborting can satisfy this.
  await expect
    .poll(() => cancelled.length, { timeout: 25_000 })
    .toBeGreaterThan(0);
});

test("returning to a recent park replays it from cache", async ({ context, page }) => {
  await startWalk(context, page, FAR_AWAY);

  // Enter Hartford Beach and let it load for real.
  await walkTo(context, page, HARTFORD, 2000);
  await expect.poll(async () => (await audioDebug(page))?.hasBuffers, { timeout: 60_000 }).toBe(true);

  const firstLoad = await audioDebug(page);
  expect(firstLoad?.bufferChannels).toBe(9);

  // Leave, then come back.
  await walkTo(context, page, FAR_AWAY, 2000);
  await walkTo(context, page, HARTFORD, 2000);

  await expect
    .poll(async () => (await audioDebug(page))?.lastLoadCacheHit, { timeout: 30_000 })
    .toBe(true);

  // The active park stays pinned, so the cache never exceeds its bound.
  const cacheEntries = (await audioDebug(page))?.cacheEntries ?? 0;
  expect(cacheEntries).toBeLessThanOrEqual(3);
});

test("bytes the walk fetches land in the disk cache for offline replay", async ({ context, page }) => {
  await startWalk(context, page, FAR_AWAY);

  await walkTo(context, page, HARTFORD, 2000);
  await expect.poll(async () => (await audioDebug(page))?.hasBuffers, { timeout: 60_000 }).toBe(true);

  // Both files of the drawn recording are on disk, under the cache name the
  // offline replay reads. The prefetch and the active load agree on the
  // same recording, so two URLs is the whole pair.
  const heldPaths = await page.evaluate(async () => {
    const cache = await caches.open("resonant-audio-v1");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(heldPaths.length).toBeGreaterThanOrEqual(2);
  expect(heldPaths.some((path) => /Hartford-Beach/.test(path))).toBe(true);
});

test("audio stops when the walker leaves the park", async ({
  context,
  page,
  baseURL,
}, testInfo) => {
  test.skip(
    !["iphone-13", "pixel-7"].includes(testInfo.project.name),
    "Audio lifecycle regression is meant for the mobile profiles."
  );
  if (!baseURL) throw new Error("Missing Playwright baseURL.");

  // Three separate code paths used to stop audio on park exit, each with a
  // comment explaining why the others were insufficient — and nothing tested
  // any of them. Deleting all three left the whole suite green while the park
  // kept playing after the walker had gone. isPlaying is the observable that
  // matters: activeUrls reflects the last load, not what is audible.
  await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
  await seedOrientationPermission(page);
  await context.setGeolocation({ latitude: 44.01308, longitude: -97.11062 });

  await page.goto(mapPath);
  await page.waitForLoadState("domcontentloaded");
  await dismissWelcomeModal(page);

  const settle = async (latitude: number, longitude: number) => {
    for (let i = 0; i < 25; i += 1) {
      await context.setGeolocation({ latitude, longitude });
      await page.waitForTimeout(60);
    }
  };

  await settle(44.01308, -97.11062);
  await expect(page.locator("p.font-cormorant").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), { timeout: 30_000 })
    .toBe(true);

  // Out to the position the approach-ring spec establishes is outside every
  // park — walking an arbitrary distance instead lands inside a neighbour,
  // because the scaled debug map packs them metres apart.
  await settle(44.01271, -97.11065);

  await expect
    .poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), { timeout: 20_000 })
    .toBe(false);
});
