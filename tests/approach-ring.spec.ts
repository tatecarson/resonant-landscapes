/**
 * Integration test for the approach phase proximity behavior.
 *
 * Verifies that the compact park strip does NOT appear while the user is in
 * prefetch range (15–40m) — the ring animation zone — and DOES appear once
 * they cross the 15m enter threshold.
 *
 * The ring itself draws on canvas and cannot be asserted here, but this test
 * guards the state boundary that drives it: prefetch range vs enter range.
 */
import { expect, test, type Page, type BrowserContext } from "@playwright/test";

// Hartford Beach State Park scaled coords: [-97.11059202645, 44.01320393348]
// Distances from each test position (verified with Haversine):
//   outside far        : Hartford 54.0m — well outside 40m ring, no animation
//   outside near       : Hartford 45.2m — approaching but still outside
//   just entering      : Hartford 39.0m — rings just appear, very slow pulse
//   prefetch far       : Hartford 36.3m — slow pulse, map zoomed in
//   prefetch mid       : Hartford 31.0m — medium pulse
//   prefetch near      : Hartford 26.4m — faster pulse
//   approaching enter  : Hartford 18.0m — fast pulse, nearly at boundary
//   just inside        : Hartford 13.0m — crossed 15m, strip appears, halo starts
//   inside park        : Hartford 11.4m — breathing halo, slow
//   near center        : Hartford  5.0m — breathing halo fast
//   halo threshold     : Hartford  2.0m — halo at max speed, about to stop
//   at center          : Hartford  0.2m — halo gone (<2m), parkDistance shows 0
const POSITIONS = {
    outsideFar:        { latitude: 44.01271,    longitude: -97.11065 },
    outsideNear:       { latitude: 44.01280,    longitude: -97.11065 },
    justEntering:      { latitude: 44.01284,    longitude: -97.11065 },
    prefetchFar:       { latitude: 44.01288,    longitude: -97.11065 },
    prefetchMid:       { latitude: 44.01292,    longitude: -97.11065 },
    prefetchNear:      { latitude: 44.01297,    longitude: -97.11065 },
    approachingEnter:  { latitude: 44.01304,    longitude: -97.11065 },
    justInside:        { latitude: 44.01308,    longitude: -97.11062 },
    insidePark:        { latitude: 44.01311,    longitude: -97.11065 },
    nearCenter:        { latitude: 44.01316,    longitude: -97.11059 },
    haloThreshold:     { latitude: 44.01319,    longitude: -97.11059202 }, // ~1.5m
    atCenter:          { latitude: 44.01320393, longitude: -97.11059202 }, // ~0m
};

const DWELL_MS = 3_000; // time to pause at each step so animations are visible

const PARK_NAME = "Hartford Beach State Park";
const DEBUG_ROUTE = "/#/debug";

async function grantGeolocation(context: BrowserContext, baseURL: string) {
    const origin = new URL(baseURL).origin;
    await context.grantPermissions(["geolocation"], { origin });
}

async function dismissWelcomeModal(page: Page) {
    const beginButton = page.getByRole("button", { name: /begin/i });
    if (await beginButton.count()) {
        await beginButton.click();
        await expect(beginButton).toHaveCount(0, { timeout: 5_000 });
    }
}

/** Polls parkStripIsVisible every 100ms for durationMs and fails immediately if it ever becomes true. */
async function pollNeverTrue(page: Page, durationMs: number): Promise<void> {
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
        if (await parkStripIsVisible(page)) {
            throw new Error("compact strip became visible inside prefetch range");
        }
        await page.waitForTimeout(100);
    }
}

async function parkStripIsVisible(page: Page): Promise<boolean> {
    // The compact strip shows the park name in a font-cormorant paragraph
    // inside a fixed bottom-0 container. Check for the park name text.
    const strip = page.locator("p.font-cormorant", { hasText: PARK_NAME });
    return (await strip.count()) > 0 && (await strip.isVisible());
}

async function screenshot(page: Page, name: string) {
    await page.screenshot({ path: `test-results/approach-ring-${name}.png`, fullPage: true });
}

/** Re-pushes a geolocation position every 500ms for durationMs so it reliably registers. */
async function dwellAt(
    context: BrowserContext,
    page: Page,
    position: { latitude: number; longitude: number },
    durationMs: number,
): Promise<void> {
    const deadline = Date.now() + durationMs;
    await context.setGeolocation(position);
    while (Date.now() < deadline) {
        await page.waitForTimeout(500);
        await context.setGeolocation(position);
    }
}

test("compact strip is absent in prefetch range and appears on park entry", async ({
    context,
    page,
    baseURL,
}) => {
    if (!baseURL) {
        throw new Error("Missing Playwright baseURL.");
    }

    await grantGeolocation(context, baseURL);
    await context.setGeolocation(POSITIONS.outsideFar);

    await page.goto(DEBUG_ROUTE);
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    // ── Step 1: well outside (54m) — no rings, no zoom ──────────────────────
    await page.waitForTimeout(1_500);
    expect(await parkStripIsVisible(page)).toBe(false);
    await screenshot(page, "1-outside-far");
    console.log("[test] step 1 — 54m: no rings, no zoom");

    // ── Step 2: closer but still outside (45m) ──────────────────────────────
    await context.setGeolocation(POSITIONS.outsideNear);
    await page.waitForTimeout(DWELL_MS);
    await screenshot(page, "2-outside-near");
    console.log("[test] step 2 — 45m: still outside prefetch");

    // ── Step 3: just entering prefetch (39m) — rings appear, map zooms in ───
    await context.setGeolocation(POSITIONS.justEntering);
    await pollNeverTrue(page, DWELL_MS);
    await screenshot(page, "3-just-entering");
    console.log("[test] step 3 — 39m: rings just appeared, map should zoom in");

    // ── Step 4: prefetch far (36m) — slow pulse ──────────────────────────────
    await context.setGeolocation(POSITIONS.prefetchFar);
    await pollNeverTrue(page, DWELL_MS);
    await screenshot(page, "4-prefetch-far");
    console.log("[test] step 4 — 36m: slow pulse");

    // ── Step 5: prefetch mid (31m) — medium pulse ────────────────────────────
    await context.setGeolocation(POSITIONS.prefetchMid);
    await pollNeverTrue(page, DWELL_MS);
    await screenshot(page, "5-prefetch-mid");
    console.log("[test] step 5 — 31m: medium pulse");

    // ── Step 6: prefetch near (26m) — faster pulse ───────────────────────────
    await context.setGeolocation(POSITIONS.prefetchNear);
    await pollNeverTrue(page, DWELL_MS);
    await screenshot(page, "6-prefetch-near");
    console.log("[test] step 6 — 26m: faster pulse");

    // ── Step 7: approaching enter boundary (18m) — fast pulse ────────────────
    await context.setGeolocation(POSITIONS.approachingEnter);
    await pollNeverTrue(page, DWELL_MS);
    await screenshot(page, "7-approaching-enter");
    console.log("[test] step 7 — 18m: fast pulse, approaching 15m boundary");

    // ── Step 8: just inside (13m) — strip appears, halo starts ───────────────
    await context.setGeolocation(POSITIONS.justInside);

    await expect
        .poll(
            async () => {
                await context.setGeolocation(POSITIONS.justInside);
                return parkStripIsVisible(page);
            },
            { timeout: 12_000, intervals: [500] }
        )
        .toBe(true);

    await page.waitForTimeout(DWELL_MS);
    await screenshot(page, "8-just-inside");
    console.log("[test] step 8 — 13m: strip appeared, breathing halo starting");

    // ── Step 9: inside park (11m) — halo slow ────────────────────────────────
    await context.setGeolocation(POSITIONS.insidePark);
    await page.waitForTimeout(DWELL_MS);
    await screenshot(page, "9-inside-park");
    console.log("[test] step 9 — 11m: breathing halo (slow)");

    // ── Step 10: near center (5m) — halo fast ────────────────────────────────
    await dwellAt(context, page, POSITIONS.nearCenter, DWELL_MS);
    await screenshot(page, "10-near-center");
    console.log("[test] step 10 — ~5m: breathing halo (fast)");

    // ── Step 11: halo threshold (~1.5m) — halo at max speed, about to stop ──
    await dwellAt(context, page, POSITIONS.haloThreshold, DWELL_MS);
    await screenshot(page, "11-halo-threshold");
    console.log("[test] step 11 — ~1.5m: halo at max speed");

    // ── Step 12: at center (~0m) — halo stops (parkDistance < 2) ────────────
    await dwellAt(context, page, POSITIONS.atCenter, DWELL_MS);
    await screenshot(page, "12-at-center");
    console.log("[test] step 12 — ~0m: halo gone, parkDistance < 2");
});
