/**
 * The map camera: one scale, and a map the walker can actually look around.
 *
 * Two bugs met here. The approach zoom animated to a second zoom level and was
 * cancelled within a frame by the setCenter that ran on every position fix, so
 * it had never once fired for anybody. And that same setCenter meant a pan
 * snapped back within a second, which left the map unable to show anything but
 * the walker's own feet.
 *
 * The fix for the second is the answer to the first: the map holds one scale
 * and stops following once the walker takes hold of it. So these assert the
 * absence of a camera move as carefully as the presence of one, because
 * "nothing happened" is exactly what the old code also looked like from
 * outside.
 */
import { expect, test, type Page } from "@playwright/test";
import { MAX_ZOOM, MIN_ZOOM, RESTING_ZOOM } from "../src/config/geofence";

/** Hartford Beach, the scaled park the other specs walk to. */
const PARK = { latitude: 44.01320393, longitude: -97.11059202 };

/** The ceiling OpenLayers actually applies. See MAX_ZOOM in geofence.ts. */
const EFFECTIVE_MAX_ZOOM = MIN_ZOOM + 3;

test.use({ viewport: { width: 390, height: 844 } });

/** A walk that can be driven metre by metre from the test. */
async function stubWalk(page: Page) {
    await page.addInitScript((park) => {
        const w = window as never as { __setPos?: (metres: number) => void };
        let metres = 180;
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
                        // Metres north of the park, as degrees of latitude. The
                        // drift keeps the position moving; a frozen fix never
                        // renders.
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
    }, PARK);
}

const zoom = (page: Page) =>
    page.evaluate(() => (window as never as { __mapZoom?: number }).__mapZoom ?? null);

const centerOnUser = (page: Page) =>
    page.evaluate(() => window.__mapDebug?.centerOnUser ?? null);

async function startWalk(page: Page) {
    await stubWalk(page);
    await page.goto("/?debug");
    await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
    await page.waitForFunction(
        () => typeof (window as never as { __mapZoom?: number }).__mapZoom === "number",
        null,
        { timeout: 20_000 }
    );
    // __mapDebug is written from a postrender that follows the first position,
    // so it lands after __mapZoom. Reading centerOnUser before it exists is
    // how this spec first "failed".
    await page.waitForFunction(() => window.__mapDebug !== undefined, null, { timeout: 20_000 });
}

async function walkTo(page: Page, metres: number) {
    await page.evaluate((m) => (window as never as { __setPos: (m: number) => void }).__setPos(m), metres);
    await page.waitForTimeout(1500);
}

/** Drag from the middle of the map, far enough to count as a pan. */
async function panTheMap(page: Page) {
    // OpenLayers attaches its drag interaction after the first renders. A drag
    // that lands before that is swallowed, which is subtle enough that it read
    // as "panning does not suspend follow" rather than "the test panned too
    // early".
    await page.waitForTimeout(1500);
    const box = await page.locator(".map").boundingBox();
    if (!box) throw new Error("map has no box to drag");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
        await page.mouse.move(x - step * 15, y - step * 9);
        await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
}

test.describe("the map holds one scale", () => {
    test("the zoom never changes across a whole approach", async ({ page }) => {
        await startWalk(page);
        const resting = await zoom(page);
        expect(resting).toBeCloseTo(RESTING_ZOOM, 3);

        // Every stage the old approach animation claimed to act on, including
        // both crossings of the 40 m prefetch boundary.
        for (const metres of [180, 90, 38, 15, 2, 38, 140]) {
            await walkTo(page, metres);
            expect(await zoom(page), `zoom at ${metres} m`).toBeCloseTo(RESTING_ZOOM, 3);
        }
    });

    test("starts at the resting zoom rather than the ceiling", async ({ page }) => {
        // The map used to open at MAX_ZOOM and be clamped down to whatever the
        // bounds controller allowed, which is how nobody noticed the resting
        // zoom was one notch under the stop.
        await startWalk(page);
        expect(await zoom(page)).toBeCloseTo(RESTING_ZOOM, 3);
    });

    test("the zoom stops are the ones OpenLayers applies, not the ones asked for", async ({ page }) => {
        await startWalk(page);
        const bounds = await page.evaluate(() => window.__mapZoomBounds ?? null);

        // The floor is honoured as written.
        expect(bounds?.minZoom).toBeCloseTo(MIN_ZOOM, 6);

        // The ceiling is not. MAX_ZOOM asks for 19.9999999 and OpenLayers
        // derives minZoom + Math.floor(log2(maxRes/minRes)), so the 3.274 span
        // floors to 3 and the real stop is MIN_ZOOM + 3. This is pinned rather
        // than fixed: 19.7258 is about 51 m across a screen, which is a fine
        // place to stop zooming in. It cost a measurement session to find, so
        // it should not be able to change quietly.
        expect(bounds?.maxZoom).toBeCloseTo(EFFECTIVE_MAX_ZOOM, 6);
        expect(bounds?.maxZoom).toBeLessThan(MAX_ZOOM);
    });
});

test.describe("the walker can look around", () => {
    test("a pan releases the map and offers it back", async ({ page }) => {
        await startWalk(page);
        expect(await centerOnUser(page)).toBe(true);
        await expect(page.getByTestId("recenter")).toHaveAttribute("data-visible", "false");

        await panTheMap(page);

        // The map stays where it was put. It used to snap back within a second.
        expect(await centerOnUser(page)).toBe(false);
        await expect(page.getByTestId("recenter")).toHaveAttribute("data-visible", "true");

        // And it stays released while the walker keeps moving.
        await walkTo(page, 120);
        expect(await centerOnUser(page)).toBe(false);
    });

    test("recenter takes the map back and resumes following", async ({ page }) => {
        await startWalk(page);
        await panTheMap(page);
        await expect(page.getByTestId("recenter")).toHaveAttribute("data-visible", "true");
        await page.getByTestId("recenter").click();
        await page.waitForTimeout(900);

        expect(await centerOnUser(page)).toBe(true);
        expect(await zoom(page)).toBeCloseTo(RESTING_ZOOM, 2);
        await expect(page.getByTestId("recenter")).toHaveAttribute("data-visible", "false");
    });

    test("panning does not bring back a camera move on the next park", async ({ page }) => {
        // The released map must not be quietly re-centred by arriving
        // somewhere, which is what the old proximity effect would have done.
        await startWalk(page);
        await panTheMap(page);
        await walkTo(page, 30);

        expect(await centerOnUser(page)).toBe(false);
        expect(await zoom(page)).toBeCloseTo(RESTING_ZOOM, 3);
    });
});
