/**
 * What is allowed to sit on top of what.
 *
 * The nearest-park chip is a fixed element in ordinary DOM; the Help modal is
 * a Headless UI Dialog inside a relative z-10 stacking context. So the chip
 * painted over the whole modal, including its close button, and a walker who
 * opened the field guide could not get out of it by pressing Close.
 *
 * The park strip had already solved this: ParkModal takes helpIsOpen and goes
 * inert. Nothing tested that, which is why the chip could repeat the mistake
 * without anything noticing. Both halves are asserted here.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/** Hartford Beach State Park scaled centre, as used by the other park specs. */
const AT_CENTRE = { latitude: 44.01320393, longitude: -97.11059202 };
/** 24.9 m out: past the exit radius, so the chip is up and no strip is. */
const WELL_OUTSIDE = { latitude: 44.01298, longitude: -97.11059202 };

/*
 * A phone viewport, not the desktop default, and that is load bearing.
 *
 * At 1280x720 the field guide is a centred panel and the chip sits far below
 * its close button, so the first test here passed with the bug still in the
 * code: nothing overlapped, nothing was blocked, and the assertion proved
 * only that a button can be pressed. The overlap the walker reported needs
 * the geometry they had, where the guide fills the screen and its close
 * button lands where the chip is.
 */
test.use({ viewport: { width: 390, height: 844 } });

const openHelp = (page: Page) => page.getByRole("button", { name: "Open field guide" }).click();
const closeButton = (page: Page) => page.getByRole("button", { name: /^close$/i });

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

/** Scroll the guide to the end, the way someone who has read it has. */
async function scrollGuideToEnd(page: Page) {
    await page.evaluate(() => {
        const scroller = Array.from(document.querySelectorAll<HTMLElement>("*")).find((node) => {
            const style = getComputedStyle(node);
            return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 40;
        });
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await page.waitForTimeout(300);
}

test("no overlay's box reaches the field guide's close button", async ({ context, page }) => {
    /*
     * Geometry rather than a hit test, and that is the whole point.
     *
     * Pressing Close and checking it worked passed with the bug still in
     * place. Scrolled to the end of the guide the two boxes really do
     * overlap, by about twenty pixels, but not far enough for the button's
     * centre point to land inside the chip, so a click sailed through.
     *
     * On the phone that reported this it is decisive, because
     * env(safe-area-inset-bottom) is around 34 px on a real iPhone and 0 in
     * every emulator, which lifts the chip that much higher over the button.
     * The overlap is therefore always worse in the field than in this test,
     * and no assertion available here reproduces the exact failure. So the
     * invariant asserted is the one that holds everywhere: while a modal is
     * open, nothing floating over the map may share space with its controls.
     */
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);
    await expect(page.getByTestId("nearest-park-chip")).toBeVisible();

    await openHelp(page);
    await scrollGuideToEnd(page);

    const close = await closeButton(page).boundingBox();
    expect(close, "the close button is not on screen to be covered").not.toBeNull();

    for (const testId of ["nearest-park-chip", "offline-notice"]) {
        const overlay = page.getByTestId(testId);
        if ((await overlay.count()) === 0) continue;

        const box = await overlay.boundingBox();
        if (!box) continue;

        const overlaps =
            box.x < close!.x + close!.width &&
            box.x + box.width > close!.x &&
            box.y < close!.y + close!.height &&
            box.y + box.height > close!.y;
        expect(overlaps, `${testId} is sitting on the field guide's close button`).toBe(false);
    }

    await closeButton(page).click();
    await expect(closeButton(page)).toHaveCount(0, { timeout: 10_000 });
});

test("the park strip does not swallow the field guide's controls either", async ({ context, page }) => {
    // The precedent the chip should have followed, and which nothing has ever
    // asserted. ParkModal takes helpIsOpen and goes inert; if that regressed,
    // the strip would trap a walker the same way the chip did.
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect(page.locator("p.font-cormorant").first()).toBeVisible({ timeout: 30_000 });

    await openHelp(page);
    await closeButton(page).click();

    await expect(closeButton(page)).toHaveCount(0, { timeout: 10_000 });
});

test("the chip comes back once the field guide is closed", async ({ context, page }) => {
    // Standing down has to be temporary. A chip that stayed hidden after the
    // walker closed the guide would cost them the only thing telling them
    // where to go next.
    await page.goto("/");
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);
    await expect(page.getByTestId("nearest-park-chip")).toBeVisible();

    await openHelp(page);
    await expect(page.getByTestId("nearest-park-chip")).toHaveCount(0);

    await closeButton(page).click();
    await expect(page.getByTestId("nearest-park-chip")).toBeVisible({ timeout: 10_000 });
});

/**
 * The install offer, which is the overlay rl-1u7.15 warned about.
 *
 * It is interactive, so unlike the offline notice it cannot simply stop
 * taking taps; it has to stand down like the chip. And it is offered once:
 * a refusal is an answer, and asking again is how a hint becomes a nag.
 */
test.describe("the install offer", () => {
    test("is not offered before the walker has heard anything", async ({ context, page }) => {
        // The banner pattern everyone dismisses without reading is the one
        // that asks before the piece has done anything worth keeping.
        await page.goto("/");
        await dismissWelcomeModal(page);
        await dwellAt(context, page, WELL_OUTSIDE, 1_500);

        await expect(page.getByTestId("install-hint")).toHaveCount(0);
        await expect(page.getByTestId("nearest-park-chip")).toBeVisible();
    });

    test("is offered after a park has been heard, and only until it is answered", async ({
        context,
        page,
    }) => {
        await page.goto("/");
        await dismissWelcomeModal(page);
        await dwellAt(context, page, AT_CENTRE, 2_000);
        await expect
            .poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
                timeout: 40_000,
                message: "audio never started",
            })
            .toBe(true);

        await dwellAt(context, page, WELL_OUTSIDE, 4_000);
        const hint = page.getByTestId("install-hint");
        await expect(hint).toBeVisible({ timeout: 10_000 });

        /*
         * The chip stays. An earlier version of this gave the offer the whole
         * bottom slot and suppressed the chip, which took away the walker's
         * only sense of where to go next at exactly the moment they had heard
         * a park and were choosing the next one. Two wayfinding specs caught
         * it. They share a stack now, and the assertion is that both are on
         * screen and neither is sitting on the other.
         */
        const chip = page.getByTestId("nearest-park-chip");
        await expect(chip).toBeVisible();

        const hintBox = await hint.boundingBox();
        const chipBox = await chip.boundingBox();
        expect(hintBox && chipBox).toBeTruthy();
        expect(
            hintBox!.y + hintBox!.height <= chipBox!.y + 1,
            "the install offer and the chip are overlapping"
        ).toBe(true);

        await hint.getByRole("button", { name: /not now/i }).click();
        await expect(hint).toHaveCount(0);
        await expect(chip).toBeVisible();

        // Answered once, and answered for good.
        await page.reload();
        await dismissWelcomeModal(page);
        await dwellAt(context, page, WELL_OUTSIDE, 2_000);
        await expect(page.getByTestId("install-hint")).toHaveCount(0);
    });

    test("stands down for the field guide, as the chip does", async ({ context, page }) => {
        await page.goto("/");
        await dismissWelcomeModal(page);
        await dwellAt(context, page, AT_CENTRE, 2_000);
        await expect
            .poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
                timeout: 40_000,
                message: "audio never started",
            })
            .toBe(true);
        await dwellAt(context, page, WELL_OUTSIDE, 4_000);
        await expect(page.getByTestId("install-hint")).toBeVisible({ timeout: 10_000 });

        await openHelp(page);
        await expect(page.getByTestId("install-hint")).toHaveCount(0);

        await scrollGuideToEnd(page);
        await closeButton(page).click();
        await expect(closeButton(page)).toHaveCount(0, { timeout: 10_000 });
    });

    test("the field guide explains it permanently, for anyone who said no", async ({ page }) => {
        await page.goto("/");
        await dismissWelcomeModal(page);
        await openHelp(page);

        const line = page.getByTestId("help-install");
        await expect(line).toBeVisible();
        await expect(line).toContainText(/home screen/i);
        // iOS has no install API, so the guide has to say the actual steps.
        await expect(line).toContainText(/add to home screen/i);
    });
});
