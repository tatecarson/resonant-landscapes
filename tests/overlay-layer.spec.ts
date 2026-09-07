/**
 * What is allowed to sit on top of what.
 *
 * The bug this was written for: the nearest-park chip was a fixed element in
 * ordinary DOM, and the Help modal is a Headless UI Dialog inside a relative
 * z-10 stacking context, so the chip painted over the whole modal — including
 * its close button — and a walker who opened the field guide could not get out
 * of it by pressing Close.
 *
 * The park strip had already solved this: ParkModal takes helpIsOpen and goes
 * inert. Nothing tested that, which is why the chip could repeat the mistake
 * without anything noticing.
 *
 * The chip is gone (rl-2l3) and the install offer that inherited its slot is
 * gone too (rl-5yp): nothing floats over the map any more, and the
 * between-parks state is the map and nothing else. The invariant outlived
 * them both — it was never about the chip, it is about anything that floats
 * over the map while a modal is open. Whatever lands there next is what this
 * file is for.
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

// The ?debug query is load-bearing here. Two tests poll
// window.__audioDebug, which a production build gates behind the query
// (src/config/debug.ts): on the bare path every poll reads undefined and
// runs to its timeout against a deploy preview, failing no matter what the
// app does — rl-9ek.5. In dev the flag changes nothing: the mirror is always
// on.
const mapPath = "/?debug";

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
    await page.goto(mapPath);
    await dismissWelcomeModal(page);
    await dwellAt(context, page, WELL_OUTSIDE, 1_500);
    // The chip used to stand here as the thing that floats over the map
    // (rl-2l3 removed it). The map itself is the honest precondition: the
    // invariant below is about anything that floats, and the loop names what
    // can.
    await expect(page.locator("canvas").first()).toBeVisible();

    await openHelp(page);
    await scrollGuideToEnd(page);

    const close = await closeButton(page).boundingBox();
    expect(close, "the close button is not on screen to be covered").not.toBeNull();

    for (const testId of ["offline-notice"]) {
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
    await page.goto(mapPath);
    await dismissWelcomeModal(page);
    await dwellAt(context, page, AT_CENTRE, 2_000);
    await expect(page.locator("p.font-cormorant").first()).toBeVisible({ timeout: 30_000 });

    await openHelp(page);
    await closeButton(page).click();

    await expect(closeButton(page)).toHaveCount(0, { timeout: 10_000 });
});

/**
 * The install affordance, which lives in the field guide and nowhere else
 * (rl-5yp). The popup over the map is gone by decision, and the tests here
 * protect both halves of that decision: nothing appears over the map, and
 * the guide can still actually install the walk where the browser will be
 * asked, rather than only describing it.
 */
test.describe("the install affordance", () => {
    test("never appears over the map, even after a park has been heard", async ({
        context,
        page,
    }) => {
        /*
         * The moment watched here is the one the offer used to choose on
         * purpose: a park just heard, the walker back outside it, choosing
         * where to go next. That was when the card was most likely to be
         * accepted, and rl-5yp removed it anyway. The between-parks state is
         * the map and nothing else.
         */
        await page.goto(mapPath);
        await dismissWelcomeModal(page);
        await dwellAt(context, page, AT_CENTRE, 2_000);
        await expect
            .poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
                timeout: 40_000,
                message: "audio never started",
            })
            .toBe(true);

        await dwellAt(context, page, WELL_OUTSIDE, 4_000);
        // Long enough that the old offer, which appeared within seconds of
        // this exact sequence, would have arrived.
        await page.waitForTimeout(6_000);

        // The map, as the control: the absence has to mean the offer is
        // gone, not that the walk never started.
        await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId("install-hint")).toHaveCount(0);
    });

    test("the field guide opens while the location banner is up", async ({ context, page }) => {
        /*
         * Found by CI rather than by design. This spec opened the guide with
         * no position fix, which is the state a runner is always in and a
         * walker is in indoors or under cover, and the click never landed:
         * the location status card spans the top of the screen and the help
         * button sits under its right-hand end.
         *
         * That is worse than the chip bug it was written for. The card
         * appears exactly when something is wrong with the walker's
         * location, and the button it covered opens the field guide, which
         * is where the instructions for fixing that live.
         */
        // Forced rather than waited for. With permission granted the banner
        // clears as soon as a fix arrives, which is immediate locally and
        // slow on CI: that timing difference is the only reason this bug
        // reached main. Refusing location holds the banner up deterministically.
        await context.clearPermissions();
        await page.goto(mapPath);
        await dismissWelcomeModal(page);
        await expect(page.getByTestId("location-status")).toBeVisible({ timeout: 30_000 });

        await openHelp(page);

        await expect(page.getByTestId("help-install")).toBeVisible();
    });

    test("the field guide explains it permanently, for anyone who said no", async ({ page }) => {
        await page.goto(mapPath);
        await dismissWelcomeModal(page);
        await openHelp(page);

        const line = page.getByTestId("help-install");
        await expect(line).toBeVisible();
        await expect(line).toContainText(/home screen/i);
        // iOS has no install API, so the guide has to say the actual steps.
        await expect(line).toContainText(/add to home screen/i);
    });

    test("can raise the real install prompt where the browser offers one", async ({ page }) => {
        /*
         * A synthetic beforeinstallprompt, because a headless browser fires
         * none. The hook cancels the event and keeps it exactly as it would
         * Chrome's, so the only question worth answering is whether the
         * guide's button reaches prompt() — the acceptance criterion is that
         * the guide installs the walk, not that it describes it.
         */
        await page.goto(mapPath);
        await dismissWelcomeModal(page);

        await page.evaluate(() => {
            let prompted = false;
            const event = new Event("beforeinstallprompt") as Event & {
                prompt: () => Promise<void>;
            };
            event.prompt = async () => {
                prompted = true;
            };
            (window as unknown as { __installPrompt?: () => boolean }).__installPrompt =
                () => prompted;
            window.dispatchEvent(event);
        });

        await openHelp(page);
        const button = page
            .getByTestId("help-install")
            .getByRole("button", { name: /add it/i });
        await expect(button).toBeVisible();

        await button.click();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as unknown as { __installPrompt?: () => boolean })
                            .__installPrompt?.() ?? false
                )
            )
            .toBe(true);

        // Used once: the event is consumed, so the button goes and does not
        // come back this session, whatever the walker chose in the dialog.
        await expect(button).toHaveCount(0);
    });
});
