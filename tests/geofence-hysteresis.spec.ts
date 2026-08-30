/**
 * The gap between the enter and exit radii, which is the only thing stopping
 * GPS jitter from re-triggering a park over and over.
 *
 * Written for rl-0p1 after a mutation pass: collapsing EXIT_DISTANCE_METERS
 * onto ENTER_DISTANCE_METERS left the entire suite green — 134 unit, 40 e2e.
 * The enter radius itself is covered, so a walker arriving was tested and a
 * walker hovering at the boundary was not, which is the case the hysteresis
 * exists for.
 *
 * Asserted on `__audioDebug.isPlaying`, which reflects the live source node.
 * `activeUrls` is not usable here: it reports the last load rather than what
 * is audible, and an earlier regression test built on it passed with the code
 * deleted.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

// Hartford Beach State Park scaled centre, matching approach-ring.spec.ts.
// Distances verified with the same Haversine the app uses.
const POSITIONS = {
    /** ~0 m: inside the 15 m enter radius, audio starts. */
    atCentre: { latitude: 44.01320393, longitude: -97.11059202 },
    /**
     * 16.45 m: outside the 15 m enter radius, inside the 18 m exit radius.
     * The hysteresis band itself. Distances here were computed with the app's
     * own distanceInMeters rather than estimated.
     */
    inTheGap: { latitude: 44.013056, longitude: -97.11059202 },
    /** 24.90 m: past the exit radius, so audio must stop. */
    wellOutside: { latitude: 44.01298, longitude: -97.11059202 },
};

const isPlaying = (page: Page) =>
    page.evaluate(() => window.__audioDebug?.isPlaying ?? false);

/** Re-push the position so a stationary walker keeps registering. */
async function dwellAt(
    context: BrowserContext,
    page: Page,
    position: { latitude: number; longitude: number },
    durationMs: number
) {
    const deadline = Date.now() + durationMs;
    await context.setGeolocation(position);
    while (Date.now() < deadline) {
        await page.waitForTimeout(500);
        await context.setGeolocation(position);
    }
}

test.beforeEach(async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("Missing Playwright baseURL.");
    await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
    await context.setGeolocation(POSITIONS.wellOutside);
    await seedOrientationPermission(page);
});

test("keeps playing in the gap between the enter and exit radii", async ({ context, page }) => {
    await page.goto("/");
    await dismissWelcomeModal(page);

    await dwellAt(context, page, POSITIONS.atCentre, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started at the centre" })
        .toBe(true);

    // Drift out past the enter radius but not past the exit radius, which is
    // what standing still at the boundary looks like to a phone.
    await dwellAt(context, page, POSITIONS.inTheGap, 6_000);

    // With the gap collapsed this reads false: the walker who has not moved
    // hears the park cut out, and hears it restart on the next fix that drifts
    // back in.
    expect(await isPlaying(page)).toBe(true);
});

test("stops once the walker is past the exit radius", async ({ context, page }) => {
    // The other half of the same promise. Without it, "keeps playing" could be
    // satisfied by never stopping at all.
    await page.goto("/");
    await dismissWelcomeModal(page);

    await dwellAt(context, page, POSITIONS.atCentre, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started at the centre" })
        .toBe(true);

    await dwellAt(context, page, POSITIONS.wellOutside, 4_000);

    await expect
        .poll(() => isPlaying(page), { timeout: 20_000, message: "audio kept playing after the walker left" })
        .toBe(false);
});
