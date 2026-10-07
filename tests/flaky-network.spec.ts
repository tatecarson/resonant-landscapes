/**
 * The walk on a bad connection, and on a phone that has paused its sound.
 *
 * Field report, Chatham, 2026-10-07: park audio often needed a page reload,
 * either to load at all or to be heard once it had. Two causes, and these
 * hold both shut.
 *
 * - A download on thin 5G could stall with the connection still open. fetch
 *   waited on it for ever, with no error to raise a Retry button, so the strip
 *   said "Loading audio" until the walker gave up (rl-kv0).
 * - Arriving at a park is not a tap. If iOS had suspended the sound in the
 *   meantime, the resume asked for on arrival was one Safari never answers,
 *   and the strip said "Audio ready" over silence with no button to press. An
 *   "interrupted" context started playing into nothing, showing Stop (rl-o4b).
 *
 * The network is faked inside the page rather than throttled, because what
 * matters is the shape of the failure: a connection that goes quiet, one that
 * refuses outright, and one that comes back. Throughput is covered by
 * audio-worst-case-mobile.spec.ts. The audio itself is a four-byte stand-in
 * decoded into silence of the right channel count, as permission-states does.
 */
import { expect, test, type Page } from "@playwright/test";

/** Hartford Beach, the scaled DSU park the other specs walk to. */
const PARK = { latitude: 44.01320393, longitude: -97.11059202 };

/** Short enough to run, long enough that a working download never trips it. */
const FAST_TIMING = { connectMs: 1_500, stallMs: 1_500, attempts: 3, backoffMs: [200] };

type NetMode = "up" | "down" | "stall-first";

/** A walk that starts away from the park and can be moved onto it. */
async function stubWalk(page: Page, startMetresNorth: number) {
    await page.addInitScript(({ park, start }) => {
        const w = window as never as { __setPos?: (metres: number) => void };
        let metres = start;
        const callbacks = new Map<number, (fix: unknown) => void>();
        let watchId = 0;
        let drift = 0;
        w.__setPos = (next: number) => {
            metres = next;
        };
        const emit = () => {
            drift += 1;
            for (const callback of callbacks.values()) {
                callback({
                    coords: {
                        latitude: park.latitude + metres / 111320 + drift * 0.0000002,
                        longitude: park.longitude,
                        accuracy: 5,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null,
                    },
                    timestamp: Date.now(),
                });
            }
        };
        window.setInterval(emit, 250);
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: {
                watchPosition: (callback: (fix: unknown) => void) => {
                    watchId += 1;
                    callbacks.set(watchId, callback);
                    return watchId;
                },
                clearWatch: (id: number) => callbacks.delete(id),
                getCurrentPosition: emit,
            },
        });
    }, { park: PARK, start: startMetresNorth });
}

/**
 * The CDN, as a phone on a bad connection sees it. `window.__net.mode` can be
 * changed mid-test; `stall-first` sends the first two bytes of each file and
 * then goes quiet, holding the connection open, which is the case that hung.
 */
async function stubNetwork(page: Page, mode: NetMode) {
    await page.addInitScript(({ initial, timing }) => {
        const w = window as never as {
            __net: { mode: string; calls: number; stalled: string[] };
            __audioFetchTiming: unknown;
            __loadedOnce: boolean;
        };
        w.__net = { mode: initial, calls: 0, stalled: [] };
        w.__audioFetchTiming = timing;
        // Set once per document. A reload would lose it, which is how the
        // specs below prove nothing was reloaded.
        w.__loadedOnce = true;

        const proto = window.AudioContext.prototype;
        const realDecode = proto.decodeAudioData;
        proto.decodeAudioData = function (this: AudioContext, data, success, failure) {
            const marker = new Uint8Array(data);
            if (data.byteLength !== 4 || marker[0] !== 82 || marker[1] !== 76 || marker[2] !== 84) {
                return realDecode.call(this, data, success, failure);
            }
            const result = Promise.resolve(this.createBuffer(marker[3], this.sampleRate * 2, this.sampleRate));
            if (success || failure) void result.then(success, failure);
            return result;
        };

        const realFetch = window.fetch;
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : String((input as Request).url ?? input);
            if (!url.includes("b-cdn.net")) return realFetch(input, init);

            w.__net.calls += 1;
            const signal = init?.signal;
            const aborted = () => new DOMException("Aborted", "AbortError");
            if (w.__net.mode === "down") {
                // What Safari and Chrome both throw for a dropped connection.
                return Promise.reject(new TypeError("Load failed"));
            }
            const channels = url.includes("_8ch.") ? 8 : 1;
            const marker = new Uint8Array([82, 76, 84, channels]);
            if (w.__net.mode === "stall-first" && !w.__net.stalled.includes(url)) {
                w.__net.stalled.push(url);
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(marker.slice(0, 2));
                        signal?.addEventListener("abort", () => controller.error(aborted()));
                    },
                });
                return Promise.resolve(new Response(body, { status: 200 }));
            }
            return Promise.resolve(new Response(marker, { status: 200 }));
        };
    }, { initial: mode, timing: FAST_TIMING });
}

/** Keep hold of the page's AudioContext so a test can suspend or interrupt it. */
async function captureAudioContext(page: Page) {
    await page.addInitScript(() => {
        const w = window as never as { __ctx?: AudioContext };
        const Real = window.AudioContext;
        window.AudioContext = class extends Real {
            constructor(options?: AudioContextOptions) {
                super(options);
                w.__ctx = this;
            }
        };
    });
}

async function start(page: Page) {
    await page.goto("/?debug");
    await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
    await page.waitForFunction(() => window.__mapDebug !== undefined, null, { timeout: 20_000 });
}

const walkTo = (page: Page, metres: number) =>
    page.evaluate((m) => (window as never as { __setPos: (m: number) => void }).__setPos(m), metres);

const setNet = (page: Page, mode: NetMode) =>
    page.evaluate((next) => {
        (window as never as { __net: { mode: string } }).__net.mode = next;
    }, mode);

const stopButton = (page: Page) => page.getByRole("button", { name: "Stop playback" });
const resumeButton = (page: Page) => page.getByRole("button", { name: "Resume audio after interruption" });
const retryButton = (page: Page) => page.getByRole("button", { name: /retry audio load/i });

const notReloaded = (page: Page) =>
    page.evaluate(() => (window as never as { __loadedOnce?: boolean }).__loadedOnce === true);

test.describe("the walk on a bad connection", () => {
    test("a download that stops arriving is tried again, and the park plays", async ({ page }) => {
        await stubWalk(page, 0);
        await stubNetwork(page, "stall-first");
        await start(page);

        await expect(stopButton(page)).toBeVisible({ timeout: 20_000 });
        // It was retried, not merely slow: the first try of each file stalled.
        expect(await page.evaluate(() => (window as never as { __net: { calls: number } }).__net.calls))
            .toBeGreaterThan(2);
        await expect(retryButton(page)).toHaveCount(0);
        expect(await notReloaded(page)).toBe(true);
    });

    test("a park that would not download plays once the signal comes back, untouched", async ({ page }) => {
        await stubWalk(page, 0);
        await stubNetwork(page, "down");
        await start(page);

        // Every try fails, so it says so, and says it is still trying.
        await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(/keep trying while you are here/i)).toBeVisible();

        // The signal comes back. Nobody taps anything.
        await setNet(page, "up");
        await page.evaluate(() => window.dispatchEvent(new Event("online")));

        await expect(stopButton(page)).toBeVisible({ timeout: 10_000 });
        expect(await notReloaded(page)).toBe(true);
    });

    test("it tries again on its own even when the phone never says it is back online", async ({ page }) => {
        await stubWalk(page, 0);
        await stubNetwork(page, "down");
        await start(page);

        await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
        await setNet(page, "up");

        // No online event: the timed retry has to find the signal by itself.
        await expect(stopButton(page)).toBeVisible({ timeout: 20_000 });
        expect(await notReloaded(page)).toBe(true);
    });
});

test.describe("arriving while the phone has paused its sound", () => {
    test("offers Resume Audio instead of saying it is ready over silence", async ({ page }) => {
        await captureAudioContext(page);
        await stubWalk(page, 120);
        await stubNetwork(page, "up");
        await start(page);

        // Between parks the phone suspends the sound, as iOS does with the
        // screen locked, and from here on refuses to resume without a tap:
        // Safari leaves that promise pending rather than rejecting it.
        await page.evaluate(async () => {
            const w = window as never as { __ctx: AudioContext; __realResume: () => Promise<void> };
            await w.__ctx.suspend();
            w.__realResume = w.__ctx.resume.bind(w.__ctx);
            w.__ctx.resume = () => new Promise<void>(() => {});
        });

        await walkTo(page, 0);

        await expect(resumeButton(page)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/^audio ready$/i)).toHaveCount(0);

        // The tap is a gesture, so the phone allows it now.
        await page.evaluate(() => {
            const w = window as never as { __ctx: AudioContext; __realResume: () => Promise<void> };
            w.__ctx.resume = w.__realResume;
        });
        await resumeButton(page).click();

        await expect(stopButton(page)).toBeVisible({ timeout: 5_000 });
        expect(await page.evaluate(() => (window as never as { __ctx: AudioContext }).__ctx.state)).toBe("running");
        expect(await notReloaded(page)).toBe(true);
    });

    test("an interrupted phone gets Resume Audio, not a Stop button over silence", async ({ page }) => {
        await captureAudioContext(page);
        await stubWalk(page, 120);
        await stubNetwork(page, "up");
        await start(page);

        // Safari's own state after a call or another app's audio. Not a
        // standard value, and not "suspended", which is why it slipped past.
        await page.evaluate(() => {
            const w = window as never as { __ctx: AudioContext };
            Object.defineProperty(w.__ctx, "state", { configurable: true, get: () => "interrupted" });
            w.__ctx.resume = () => new Promise<void>(() => {});
        });

        await walkTo(page, 0);

        await expect(resumeButton(page)).toBeVisible({ timeout: 15_000 });
        await expect(stopButton(page)).toHaveCount(0);

        // The interruption ends; the walker taps Resume.
        await page.evaluate(() => {
            const w = window as never as { __ctx: AudioContext & { state?: unknown } };
            delete (w.__ctx as { state?: unknown }).state;
            delete (w.__ctx as { resume?: unknown }).resume;
        });
        await resumeButton(page).click();

        await expect(stopButton(page)).toBeVisible({ timeout: 5_000 });
    });
});
