/**
 * The third site, opening to an audience on 5 October 2026.
 *
 * The placement itself is asserted in scaledParks.test.ts, where the maths
 * lives. This covers the part only a browser can: that the route resolves,
 * that the walk opens on the campus rather than the Gulf of Guinea, and that
 * the welcome screen names the right place. A variant whose route never
 * matched would fail none of the unit tests and would open in South Dakota.
 */
import { expect, test } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/** Middle of the campus, from OSM way 172206707. */
const ON_CAMPUS = { latitude: 40.44756, longitude: -79.925 };

test.beforeEach(async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("Missing Playwright baseURL.");
    await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
    await context.setGeolocation(ON_CAMPUS);
    await seedOrientationPermission(page);
});

test("the chatham route names Chatham on the welcome screen", async ({ page }) => {
    await page.goto("/#/chatham");

    await expect(page.getByText(/walk chatham's campus/i)).toBeVisible({ timeout: 15_000 });
});

test("a walker on the campus is standing among the recordings", async ({ page, context }) => {
    /*
     * The claim is the same one this test always made: the points are HERE and
     * not in South Dakota. It used to be read off the nearest-park chip, which
     * named a park and its distance; the chip is gone (rl-2l3) and the walk's
     * proximity tint carries the same fact in a stricter form.
     *
     * data-warmth is derived from the distance to the nearest recording the
     * walker has not heard, and it is zero beyond COLD_AT_METERS. So a
     * non-zero value here means a recording is within 120 m of the middle of
     * Chatham's campus. The old assertion allowed anything under a kilometre;
     * this one is an order of magnitude tighter, and a variant that fell
     * through to the DSU points would read a flat zero rather than pointing
     * at a park 1,300 km west.
     */
    await page.goto("/#/chatham");
    await dismissWelcomeModal(page);

    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
        await page.waitForTimeout(500);
        await context.setGeolocation(ON_CAMPUS);
    }

    const warmth = page.getByTestId("proximity-warmth");
    await expect(warmth).toBeAttached({ timeout: 15_000 });
    await expect
        .poll(
            async () => Number((await warmth.getAttribute("data-warmth")) ?? 0),
            {
                timeout: 15_000,
                message:
                    "nothing within 120 m of the middle of the campus — the Chatham points are not where the walk thinks they are",
            }
        )
        .toBeGreaterThan(0);
});

test("the default route is still the DSU walk", async ({ page }) => {
    // Adding a third site must not quietly move the other two.
    await page.goto("/");

    await expect(page.getByText(/walk dsu's campus/i)).toBeVisible({ timeout: 15_000 });
});
