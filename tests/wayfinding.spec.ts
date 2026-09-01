/**
 * Where to go next, and what has already been heard.
 *
 * Outside prefetch range the map showed a walker their own dot on empty
 * ground: nothing said there was another park, how far it was, or which way.
 * That is the state a walk spends most of its time in.
 *
 * The heard count is the assertable end of the whole chain. It only moves if
 * playback actually started, the park was recorded, the store persisted it
 * and the chip re-read it, so it stands in for the marker change as well,
 * which is painted onto a canvas that cannot be read back.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/** Hartford Beach State Park scaled centre, as used by the other park specs. */
const AT_CENTRE = { latitude: 44.01320393, longitude: -97.11059202 };
/** 24.9 m out: past the exit radius, so no park is active and the chip is up. */
const WELL_OUTSIDE = { latitude: 44.01298, longitude: -97.11059202 };

/**
 * Extra dwell so a recorded run is watchable. Default 0 because CI gains
 * nothing from waiting; `npm run demo:wayfinding` sets it. Same idea as
 * REDUCE_VISUALS_HOLD_MS and APPROACH_RING_HOLD_MS.
 */
const HOLD_MS = Number(process.env.WAYFINDING_HOLD_MS ?? 0);
const hold = (page: Page) => (HOLD_MS ? page.waitForTimeout(HOLD_MS) : Promise.resolve());

const chip = (page: Page) => page.getByTestId("nearest-park-chip");
const nearestLine = (page: Page) => page.getByTestId("nearest-park-line");
const heardCount = (page: Page) => page.getByTestId("heard-count");

const isPlaying = (page: Page) =>
    page.evaluate(() => window.__audioDebug?.isPlaying ?? false);

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
    await context.setGeolocation(WELL_OUTSIDE);
    await seedOrientationPermission(page);
});

test("tells a walker with no park in range where the nearest one is", async ({ context, page }) => {
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);

    await expect(chip(page)).toBeVisible();
    // Name, a distance in metres, and one of the eight compass points.
    await expect(nearestLine(page)).toHaveText(
        /^.+ · \d+ m (NE|NW|SE|SW|N|E|S|W)$/i
    );
    await expect(heardCount(page)).toHaveText(/^\d+ of \d+ heard$/i);

    // The visible line abbreviates the compass point, which a screen reader
    // would spell out letter by letter.
    await expect(nearestLine(page)).toHaveAttribute(
        "aria-label",
        /^Nearest park: .+, \d+ metres to the (north|south|east|west)( (east|west))?$/i
    );
});

test("stands down while the walker is standing in a park", async ({ context, page }) => {
    // The chip and the park strip share the bottom of the display, and
    // someone standing in a park does not need directions to the nearest one.
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);
    await expect(chip(page)).toBeVisible();

    await dwellAt(context, page, AT_CENTRE, 2_000);

    await expect(chip(page)).toHaveCount(0);
});

test("counts a park as heard once its audio has actually played", async ({ context, page }) => {
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);
    await expect(heardCount(page)).toHaveText(/^0 of \d+ heard$/);
    await hold(page);

    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started" })
        .toBe(true);
    await hold(page);

    await dwellAt(context, page, WELL_OUTSIDE, 4_000);

    await expect(chip(page)).toBeVisible();
    await expect(heardCount(page)).toHaveText(/^1 of \d+ heard$/);
    await hold(page);
});

test("remembers what was heard across a reload", async ({ context, page }) => {
    // A walk is long, and a count that resets when the phone locks and the
    // page reloads is not a record of anything.
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started" })
        .toBe(true);

    await page.reload();
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 2_000);

    await expect(heardCount(page)).toHaveText(/^1 of \d+ heard$/);
});

test("swaps the park marker without OpenLayers refusing the new icon", async ({ context, page }) => {
    /*
     * The markers are painted onto the OpenLayers canvas, which is tainted by
     * cross-origin tiles and cannot be read back, so the icon itself is not
     * assertable. What is assertable is the failure mode: rlayers reports an
     * icon whose src changed after creation as a console warning rather than
     * an error, and the marker silently keeps the old dot for the rest of the
     * walk. This is the guard against that being reintroduced.
     */
    const warnings: string[] = [];
    page.on("console", (message) => {
        if (/does not support updating of src/i.test(message.text())) {
            warnings.push(message.text());
        }
    });

    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started" })
        .toBe(true);
    await dwellAt(context, page, WELL_OUTSIDE, 3_000);

    expect(warnings, "the heard marker was rejected and the old icon stayed").toEqual([]);
});

test.describe("on the narrowest phone in the support matrix", () => {
    test.use({ viewport: { width: 320, height: 568 } });

    test("truncates the park name and keeps the distance and bearing", async ({ context, page }) => {
        /*
         * The name and the metrics were one string, under one truncate. The
         * longest park here, "Fort Sisseton Historic State Park", is 33
         * characters and overflows 320 px on its own, so the end of the line
         * was the first thing cut, and the end of the line is the distance
         * and the bearing. Losing the tail of a name a walker can already see
         * on the map costs nothing; losing the two numbers they set off on
         * costs them the chip.
         */
        await page.goto("/");
        await dismissWelcomeModal(page);
        await dwellAt(context, page, WELL_OUTSIDE, 1_500);

        await expect(nearestLine(page)).toContainText(/\d+ m (NE|NW|SE|SW|N|E|S|W)$/i);
    });
});
