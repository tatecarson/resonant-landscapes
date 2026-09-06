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

// The ?debug query is load-bearing here. Three tests poll isPlaying(), which
// reads window.__audioDebug — a mirror a production build gates behind the
// query (src/config/debug.ts). On the bare path the poll reads undefined
// forever against a deploy preview and fails no matter what the app does —
// rl-9ek.5. In dev the flag changes nothing: the mirror is always on.
// page.reload() keeps the query, so the reload test stays on the debug path.
const mapPath = "/?debug";

// The chip that carried "1 of 13 heard" is gone (rl-2l3), so the count is no
// longer on screen to assert against. What it was reporting has not gone
// anywhere: heardParks is the record of what actually played, it is what the
// map draws its markers from, and it is the thing these tests were always
// really about. Read it where it lives rather than through a UI that no
// longer exists.
const heardParks = (page: Page) =>
    page.evaluate(() => {
        try {
            return JSON.parse(window.localStorage.getItem("heardParks") ?? "[]") as string[];
        } catch {
            return [] as string[];
        }
    });

/**
 * What the tint that replaced the chip is currently saying, 0 cold to 1 warm.
 * The element reports it as a data attribute precisely so a spec need not
 * assert on a colour: the ramp is tuning, and this is not a test about tuning.
 */
const warmth = (page: Page) =>
    page
        .getByTestId("proximity-warmth")
        .getAttribute("data-warmth")
        .then((value) => Number(value ?? 0));

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

test("counts a park as heard once its audio has actually played", async ({ context, page }) => {
    await page.goto(mapPath);
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);
    expect(await heardParks(page)).toEqual([]);
    const warmBefore = await warmth(page);
    await hold(page);

    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started" })
        .toBe(true);
    await hold(page);

    await dwellAt(context, page, WELL_OUTSIDE, 4_000);

    await expect
        .poll(async () => (await heardParks(page)).length, {
            timeout: 10_000,
            message: "the park that played was never recorded as heard",
        })
        .toBe(1);

    /*
     * The same standpoint, cooler, because what it is near has been used up.
     * This is the whole reason the tint is keyed to unheard recordings rather
     * than to whatever is closest (rl-2l3): keyed to the nearest of any kind
     * it would read identically here, warmest while the walker stands beside
     * the one thing they have already listened to.
     *
     * A margin, not merely "less": the spots on this campus sit about 20 m
     * apart, so hearing one leaves another close behind it, and a drop too
     * small to see would satisfy a bare inequality while failing the walker.
     */
    await expect
        .poll(async () => await warmth(page), {
            timeout: 10_000,
            message: "the tint did not cool after the park beside it was heard",
        })
        .toBeLessThan(warmBefore - 0.1);
    await hold(page);
});

test("remembers what was heard across a reload", async ({ context, page }) => {
    // A walk is long, and a count that resets when the phone locks and the
    // page reloads is not a record of anything.
    await page.goto(mapPath);
    await dismissWelcomeModal(page);
    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started" })
        .toBe(true);

    await page.reload();
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 2_000);

    expect(await heardParks(page)).toHaveLength(1);
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

    await page.goto(mapPath);
    await dismissWelcomeModal(page);
    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started" })
        .toBe(true);
    await dwellAt(context, page, WELL_OUTSIDE, 3_000);

    expect(warnings, "the heard marker was rejected and the old icon stayed").toEqual([]);
});
