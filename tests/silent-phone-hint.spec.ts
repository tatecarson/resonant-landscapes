/**
 * The park strip says "Playing" whether or not the walker can hear anything.
 *
 * A silenced phone plays the recording into a muted speaker: the audio is
 * running, the strip is telling the truth about the app, and the walker is
 * standing in a park in silence. Safari exposes neither the ringer state nor
 * a reliable way for this Web Audio walk to override it. The hint belongs next
 * to playback, but only long enough to help someone who hears nothing.
 *
 * The whole promise of rl-d2a is that this is readable while standing at a
 * park without opening the Help modal, which is where the advice used to
 * live. So the assertion is on the strip that is visible on arrival.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/**
 * Asserted on the rendered text rather than by importing src/copy, the way
 * the spatial-degraded note is. copy.ts imports a type from App, so pulling
 * it into a spec drags the whole application graph into the Playwright
 * TypeScript program for one string.
 */
const EXPECTED_HINT = {
    ios: /silent mode/i,
    android: /media volume/i,
    other: /volume/i,
};

// Hartford Beach State Park scaled centre, matching geofence-hysteresis.spec.
const AT_CENTRE = { latitude: 44.01320393, longitude: -97.11059202 };
const WELL_OUTSIDE = { latitude: 44.01298, longitude: -97.11059202 };

const isPlaying = (page: Page) =>
    page.getByRole("button", { name: "Stop playback" }).isVisible();

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

test("tells a walker at a park why a silenced phone hears nothing", async ({ context, page }) => {
    await page.goto("/");
    await dismissWelcomeModal(page);

    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started at the centre" })
        .toBe(true);

    const hint = page.getByTestId("silence-hint").first();
    await expect(hint).toBeVisible();

    await expect(hint).toContainText(/no sound\?/i);

    // Worded for the phone in hand: the side switch is an iPhone, and telling
    // an Android walker to look for a switch it does not have is worse than
    // saying nothing.
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const platform = /iPhone|iPad|iPod/i.test(userAgent)
        ? "ios"
        : /Android/i.test(userAgent)
            ? "android"
            : "other";
    await expect(hint).toContainText(EXPECTED_HINT[platform]);
});

test("clears the silent-mode hint after the opening moments", async ({ context, page }) => {
    await page.goto("/");
    await dismissWelcomeModal(page);

    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started at the centre" })
        .toBe(true);

    const hint = page.getByTestId("silence-hint").first();
    await expect(hint).toBeVisible();
    await expect(hint).toHaveCount(0, { timeout: 10_000 });
});

test("does not stand there qualifying a park that is not playing", async ({ context, page }) => {
    // The other half. A hint that is always on screen is one nobody reads by
    // the second park, and it would be answering a question the walker who is
    // not hearing a park yet has not asked.
    await page.goto("/");
    await dismissWelcomeModal(page);

    await expect(page.getByTestId("silence-hint")).toHaveCount(0);

    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 40_000, message: "audio never started at the centre" })
        .toBe(true);
    await expect(page.getByTestId("silence-hint").first()).toBeVisible();

    await dwellAt(context, page, WELL_OUTSIDE, 4_000);
    await expect
        .poll(() => isPlaying(page), { timeout: 20_000, message: "audio kept playing after the walker left" })
        .toBe(false);

    await expect(page.getByTestId("silence-hint")).toHaveCount(0);
});
