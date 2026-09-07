/**
 * The modal's action has to be on the first screen (rl-uo5).
 *
 * The regression this guards is not "the panel is anchored wrongly" — it is
 * "the panel is taller than the phone". Measured on BrowserStack real devices,
 * the welcome panel's content is 757pt on an iPhone 14 and 772pt on an iPhone
 * SE, against 663pt and 548pt of screen once Safari has drawn its toolbars.
 * START was below the fold on the first screen, and no min-height on the
 * container could raise it.
 *
 * So the viewports here are the *measured* ones, not the device profiles.
 * devices["iPhone 13"] is 390x844, because an emulated browser draws no chrome
 * — at 844pt of viewport the whole panel fits and this test would pass against
 * the bug. 663 and 548 are what those two phones actually give a page.
 */
import { test, expect, type Page } from "@playwright/test";

/** Matches START and the "Start anyway" a blocked preflight renders. */
const START = /^\s*start(\s+anyway)?\s*$/i;

/**
 * Fully inside the viewport, with no scrolling first — which is the whole
 * question. toBeInViewport's default ratio would accept a button one pixel
 * of which is showing, and toBeVisible would accept one entirely below the
 * fold, since neither is what "visible" means to Playwright.
 */
async function expectFullyOnFirstScreen(page: Page, name: string) {
    const button = page.getByRole("button", { name: START });
    await expect(button).toBeAttached({ timeout: 15_000 });
    // The panel animates in over 300ms; measuring through it reads a
    // transform mid-flight rather than where the button lands.
    await page.waitForTimeout(600);

    const box = await button.boundingBox();
    const viewport = page.viewportSize();
    expect(box, `${name}: START has no box`).not.toBeNull();
    expect(viewport, `${name}: no viewport`).not.toBeNull();

    expect(box!.y, `${name}: START starts above the screen`).toBeGreaterThanOrEqual(0);
    expect(
        box!.y + box!.height,
        `${name}: START ends ${Math.round(box!.y + box!.height)}pt down a ${viewport!.height}pt screen`
    ).toBeLessThanOrEqual(viewport!.height);
}

const MEASURED = [
    // iPhone SE 2022, iOS 15, Safari with its toolbars up.
    { name: "iPhone SE, chrome drawn", width: 375, height: 548 },
    // iPhone 14, iOS 18, the same.
    { name: "iPhone 14, chrome drawn", width: 390, height: 663 },
];

for (const { name, width, height } of MEASURED) {
    test(`welcome modal: START is on the first screen at ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto("/");
        await expectFullyOnFirstScreen(page, name);
    });
}

test("welcome modal: the desktop panel is unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expectFullyOnFirstScreen(page, "desktop");

    // Still centred rather than bottom-anchored: the mobile fix is not
    // allowed to turn the desktop dialog into a sheet.
    const panel = page.locator(".modal-panel");
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    const above = box!.y;
    const below = 800 - (box!.y + box!.height);
    expect(Math.abs(above - below), "panel is not centred").toBeLessThan(8);
});

test("welcome modal: a panel taller than the screen scrolls inside itself", async ({ page }) => {
    // The other half of the fix. The prose does not disappear to make room
    // for the button — it moves into the panel's own scroll container, which
    // has to actually reach the end of the text.
    await page.setViewportSize({ width: 375, height: 548 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: START })).toBeAttached({ timeout: 15_000 });

    const panel = page.locator(".modal-panel");
    const reach = await panel.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
    }));
    expect(reach.overflowY, "the panel is not a scroll container").toBe("auto");
    expect(reach.scrollHeight, "nothing to scroll — the panel is not the tall case here")
        .toBeGreaterThan(reach.clientHeight);

    await panel.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    const atBottom = await panel.evaluate(
        (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1
    );
    expect(atBottom, "the panel cannot be scrolled to its end").toBe(true);

    // And the button is still there after scrolling, which is what sticky buys.
    await expectFullyOnFirstScreen(page, "after scrolling to the end");
});

test("welcome modal: says there is more below, and stops saying it at the end", async ({ page }) => {
    // The fade alone is not a cue. On a 375x548 screen the fold falls between
    // two paragraphs, so nothing is visibly cut and the panel looks complete
    // when 41% of it is not (rl-uo5) — three of the four walk instructions,
    // the headphones line and the sound-permission line are all below it.
    await page.setViewportSize({ width: 375, height: 548 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: START })).toBeAttached({ timeout: 15_000 });

    const panel = page.locator(".modal-panel");
    const cue = panel.getByText(/more below/i);
    await expect(cue).toBeVisible();
    await expect(cue).toHaveCSS("opacity", "1");

    await panel.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    // The space it occupied stays occupied: the button must not slide up
    // under a thumb already travelling towards it.
    await expect(cue).toHaveCSS("opacity", "0");
    await expect(cue).toBeAttached();

    await expectFullyOnFirstScreen(page, "at the end of the panel");
});

test("welcome modal: a panel that fits carries no cue and no gap for one", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: START })).toBeAttached({ timeout: 15_000 });

    const panel = page.locator(".modal-panel");
    const fits = await panel.evaluate((element) => element.scrollHeight <= element.clientHeight + 1);
    expect(fits, "the desktop panel is scrolling — this check proves nothing").toBe(true);
    await expect(panel.getByText(/more below/i)).toHaveCount(0);
});

test("welcome modal: the cap comes from the measured viewport, not the unit", async ({ page }) => {
    // The unit was the bug. svh is honest on every device that could be
    // automated — BrowserStack's iPhone 14 and SE, iOS 26 Safari — and was not
    // on a hand-held iPhone, where the action scrolled away with the text
    // because the panel never became a scroll container (rl-uo5).
    await page.setViewportSize({ width: 390, height: 663 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: START })).toBeAttached({ timeout: 15_000 });

    const measured = await page.evaluate(() => {
        const root = document.documentElement;
        const panel = document.querySelector<HTMLElement>(".modal-panel");
        const scroller = document.querySelector<HTMLElement>(".modal-scroller");
        return {
            attribute: root.hasAttribute("data-viewport-measured"),
            published: root.style.getPropertyValue("--visual-viewport-height"),
            visible: window.visualViewport?.height ?? window.innerHeight,
            panelMaxHeight: panel ? parseFloat(getComputedStyle(panel).maxHeight) : null,
            scrollerHeight: scroller ? scroller.getBoundingClientRect().height : null,
        };
    });

    expect(measured.attribute, "the measured path is not switched on").toBe(true);
    expect(measured.published).toBe(`${measured.visible}px`);
    // The gutter is 1rem above the panel plus max(1rem, safe-area) below it,
    // which is 32px wherever the inset is not larger than 1rem.
    expect(measured.panelMaxHeight).toBeCloseTo(measured.visible - 32, 0);
    // And the scrollport is the visible area itself, so a bottom-anchored
    // panel cannot land under browser chrome that the layout viewport ignores.
    expect(measured.scrollerHeight).toBeCloseTo(measured.visible, 0);
});
