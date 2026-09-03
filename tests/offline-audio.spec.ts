/**
 * A park the walk holds plays again with no signal.
 *
 * This is the acceptance the cache-on-use work exists for, and it cannot be
 * asserted in dev: the service worker only exists in a built bundle, and
 * although the page-side audio cache itself works without one, the offline
 * visit this spec simulates — shell, map, recording, all without a network —
 * is exactly the walk an installed walker takes.
 *
 * The shape: hear a park online with its bytes served by a route, cut the
 * network, reload, and walk back in. The seed draws a fresh recording this
 * visit, which is almost certainly not the held one, so what plays is the
 * replay path: seeded fetch fails offline, the held recording substitutes,
 * and the strip corrects its "recording N of M" to match.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

// DSU-scaled positions, shared with audio-cache-behavior.spec.ts.
const HARTFORD: [number, number] = [44.01320393348, -97.11059202645];
const FAR_AWAY: [number, number] = [44.01150129188, -97.11064253895];

/**
 * Tiny valid PCM WAV files in place of the real ~10 MB payloads. The loader
 * decodes whatever bytes arrive — the extension is never consulted — so an
 * 8-channel and a 1-channel file exercise decode, merge, and playback end
 * to end while keeping the spec fast.
 */
function makeWav(channels: number, seconds = 0.1, sampleRate = 48000): Buffer {
    const frames = Math.floor(sampleRate * seconds);
    const dataBytes = frames * channels * 2;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * channels * 2, 28);
    buffer.writeUInt16LE(channels * 2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataBytes, 40);
    return buffer;
}

const isPlaying = (page: Page) => page.evaluate(() => window.__audioDebug?.isPlaying ?? false);

/** WebKit is not the only engine that wants a nudge before geolocation lands. */
async function walkTo(
    context: BrowserContext,
    page: Page,
    [latitude, longitude]: [number, number],
    settleMs = 1200,
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

async function waitForController(page: Page) {
    await page.waitForFunction(
        () => Boolean(navigator.serviceWorker?.controller),
        undefined,
        { timeout: 30_000 },
    );
}

test("a park the walk holds plays again with no signal", async ({ context, page }) => {
    // Online visit: hear the park with synthetic bytes, which the seam
    // writes through to the disk cache as they arrive.
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: FAR_AWAY[0], longitude: FAR_AWAY[1] });
    await seedOrientationPermission(page);
    await page.goto("/?debug");
    await dismissWelcomeModal(page);

    const served: string[] = [];
    await page.route(/b-cdn\.net\/sounds/, async (route) => {
        const url = route.request().url();
        served.push(url);
        const channels = /_8ch\./.test(url) ? 8 : 1;
        await route.fulfill({
            status: 200,
            contentType: "audio/wav",
            body: makeWav(channels),
        });
    });

    await walkTo(context, page, HARTFORD, 2000);
    await expect
        .poll(() => isPlaying(page), { timeout: 60_000, message: "the online visit never played" })
        .toBe(true);

    // The pair is on disk before the signal is gone. Both files of the
    // drawn recording came over the wire and were held under the name the
    // replay reads.
    expect(served.length).toBeGreaterThanOrEqual(2);
    const heldPaths = await page.evaluate(async () => {
        const cache = await caches.open("resonant-audio-v1");
        return (await cache.keys()).map((request) => new URL(request.url).pathname);
    });
    expect(heldPaths.length).toBeGreaterThanOrEqual(2);
    expect(heldPaths.some((path) => /Hartford-Beach/.test(path))).toBe(true);

    // Offline visit: a fresh load of the shell, no route, no network.
    // Whatever plays now can only come from the phone.
    await page.unroute(/b-cdn\.net\/sounds/);
    await waitForController(page);
    await context.setOffline(true);
    await page.reload();
    await dismissWelcomeModal(page);

    await walkTo(context, page, HARTFORD, 2000);
    await expect
        .poll(() => isPlaying(page), { timeout: 30_000, message: "nothing played with no signal" })
        .toBe(true);

    // The strip corrects itself: with a fresh seed this visit, what plays is
    // the held recording, and "recording N of M" says so.
    await expect(page.locator("p", { hasText: /recording \d+ of \d+/ })).toBeVisible();
});
