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

test("a walker on the campus is told which park is nearest", async ({ page, context }) => {
    // The chip is the proof the points are here and not in South Dakota: it
    // names a park and a distance measured from where the walker is standing.
    await page.goto("/#/chatham");
    await dismissWelcomeModal(page);

    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
        await page.waitForTimeout(500);
        await context.setGeolocation(ON_CAMPUS);
    }

    const line = page.getByTestId("nearest-park-line");
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toHaveText(/^.+ · \d+ m (NE|NW|SE|SW|N|E|S|W)$/i);
    // Hundreds of metres, not hundreds of kilometres: a variant that fell
    // through to the DSU points would still render a chip, pointing at a
    // park 1,300 km west.
    const text = (await line.textContent()) ?? "";
    expect(Number(text.match(/(\d+) m/)?.[1] ?? Infinity)).toBeLessThan(1_000);
});

test("the default route is still the DSU walk", async ({ page }) => {
    // Adding a third site must not quietly move the other two.
    await page.goto("/");

    await expect(page.getByText(/walk dsu's campus/i)).toBeVisible({ timeout: 15_000 });
});
