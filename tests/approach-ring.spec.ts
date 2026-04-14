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
//   outside prefetch   : Hartford 45.2m — outside 40m ring, no animation
//   prefetch far       : Hartford 36.3m — just inside 40m, slow pulse
//   prefetch near      : Hartford 26.4m — deeper in, faster pulse
//   inside park        : Hartford 11.4m — crosses 15m threshold, strip appears
const POSITIONS = {
    outsidePrefetch: { latitude: 44.01280, longitude: -97.11065 },
    prefetchFar:     { latitude: 44.01288, longitude: -97.11065 },
    prefetchNear:    { latitude: 44.01297, longitude: -97.11065 },
    insidePark:      { latitude: 44.01311, longitude: -97.11065 },
};

const PARK_NAME = "Hartford Beach State Park";
const DEBUG_ROUTE = "/#/debug";
const holdInPrefetchMs = Number(process.env.APPROACH_RING_HOLD_MS ?? 2_000);

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

test("compact strip is absent in prefetch range and appears on park entry", async ({
    context,
    page,
    baseURL,
}) => {
    if (!baseURL) {
        throw new Error("Missing Playwright baseURL.");
    }

    await grantGeolocation(context, baseURL);
    await context.setGeolocation(POSITIONS.outsidePrefetch);

    await page.goto(DEBUG_ROUTE);
    await page.waitForLoadState("domcontentloaded");
    await dismissWelcomeModal(page);

    // ── Step 1: outside prefetch range ─────────────────────────────────────
    // Allow time for geolocation to settle
    await page.waitForTimeout(1_500);
    expect(await parkStripIsVisible(page)).toBe(false);
    console.log("[test] ✓ compact strip absent outside prefetch range");

    // ── Step 2: just inside prefetch range — slow pulse ─────────────────────
    await context.setGeolocation(POSITIONS.prefetchFar);
    await pollNeverTrue(page, holdInPrefetchMs);
    console.log("[test] ✓ compact strip absent throughout prefetch far dwell (36m — slow pulse)");

    // ── Step 3: deeper in prefetch range — faster pulse ──────────────────────
    await context.setGeolocation(POSITIONS.prefetchNear);
    await pollNeverTrue(page, holdInPrefetchMs);
    console.log("[test] ✓ compact strip absent throughout prefetch near dwell (26m — faster pulse)");

    // ── Step 3: inside enter range — strip should appear ────────────────────
    await context.setGeolocation(POSITIONS.insidePark);

    await expect
        .poll(
            async () => {
                await context.setGeolocation(POSITIONS.insidePark);
                return parkStripIsVisible(page);
            },
            { timeout: 12_000, intervals: [500] }
        )
        .toBe(true);

    console.log(`[test] ✓ compact strip visible after crossing 15m threshold`);

    await page.screenshot({
        path: "test-results/approach-ring-entered-park.png",
        fullPage: true,
    });
});
