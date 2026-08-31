/**
 * The calmer-visuals switch has to actually reach the visuals.
 *
 * The switch, the stored preference and the layers that draw are three
 * separate pieces, and a control that saves a preference nothing reads is the
 * easiest version of this feature to ship by accident. Asserted on the ambient
 * gradient, which drops its opacity transition when visuals are calmed, so
 * this fails if the wiring is cut anywhere between the modal and the layer.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

const AT_PARK = { latitude: 44.01320393, longitude: -97.11059202 };
/** 31 m: inside prefetch range, outside the park, which is where rings pulse. */
const APPROACHING = { latitude: 44.01292, longitude: -97.11059202 };

/**
 * Count the arcs the decorative layers draw.
 *
 * The rings and rays paint onto the OpenLayers canvas, which cannot be read
 * back: cross-origin map tiles taint it, so toDataURL throws and comparing
 * pixels across frames is not available. Counting draw calls measures the same
 * thing more directly anyway. Calming the visuals stops the frame loop, so the
 * count should fall to nothing rather than merely change.
 */
async function countArcsOver(page: Page, ms: number) {
    const before = await page.evaluate(() => window.__arcCount ?? 0);
    await page.waitForTimeout(ms);
    return (await page.evaluate(() => window.__arcCount ?? 0)) - before;
}

async function instrumentArcs(page: Page) {
    await page.addInitScript(() => {
        const proto = CanvasRenderingContext2D.prototype;
        const realArc = proto.arc;
        window.__arcCount = 0;
        proto.arc = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof realArc>) {
            window.__arcCount = (window.__arcCount ?? 0) + 1;
            return realArc.apply(this, args);
        };
    });
}

declare global {
    interface Window {
        __arcCount?: number;
    }
}

/**
 * The gradient only exists while a park panel is mounted, so the walker has to
 * actually arrive before there is anything to assert on. One setGeolocation is
 * not enough: the app interpolates over a history of fixes and a single one
 * never renders, which passed locally on timing luck and timed out on CI.
 */
async function walkIntoParkUntilGradient(context: BrowserContext, page: Page) {
    const gradient = page.getByTestId("ambient-gradient");
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
        await context.setGeolocation(AT_PARK);
        if (await gradient.count()) return;
        await page.waitForTimeout(500);
    }

    throw new Error("never arrived at a park: the ambient gradient did not mount");
}

const gradientClass = (page: Page) =>
    page.getByTestId("ambient-gradient").getAttribute("class");

const calmerSwitch = (page: Page) =>
    page.getByRole("switch", { name: /calmer visuals/i });

test.beforeEach(async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("Missing Playwright baseURL.");
    await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
    await context.setGeolocation(AT_PARK);
    await seedOrientationPermission(page);
    await page.goto("/");
    await dismissWelcomeModal(page);
    await walkIntoParkUntilGradient(context, page);
    await page.getByRole("button", { name: "Open field guide" }).click();
});

test("turning the switch on calms a map layer, not just a stored value", async ({ page }) => {
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "false");
    expect(await gradientClass(page)).toContain("transition-opacity");

    await calmerSwitch(page).click();

    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect
        .poll(async () => await gradientClass(page), { timeout: 5_000 })
        .not.toContain("transition-opacity");
});

test("turning it back off restores them", async ({ page }) => {
    // The other direction, so "calms" cannot be satisfied by a switch that
    // only ever moves one way.
    await calmerSwitch(page).click();
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");

    await calmerSwitch(page).click();

    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect
        .poll(async () => await gradientClass(page), { timeout: 5_000 })
        .toContain("transition-opacity");
});

test("the choice survives a reload", async ({ page, context }) => {
    await calmerSwitch(page).click();
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await dismissWelcomeModal(page);
    await walkIntoParkUntilGradient(context, page);
    await page.getByRole("button", { name: "Open field guide" }).click();

    // A preference that resets every time the walker reopens the piece is not
    // a preference, and this one is set precisely because a walk is long.
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");
    expect(await gradientClass(page)).not.toContain("transition-opacity");
});

test("calming the visuals stops the decorative layers redrawing", async ({ context, page }) => {
    // The gap the other tests here leave: they prove the switch reaches the
    // ambient gradient, which is a div. The rings and rays are canvas draws on
    // their own animation loop, and nothing asserted those ever stopped.
    await instrumentArcs(page);
    await context.setGeolocation(APPROACHING);
    await page.goto("/");
    await dismissWelcomeModal(page);

    for (let attempt = 0; attempt < 20; attempt += 1) {
        await context.setGeolocation(APPROACHING);
        if ((await countArcsOver(page, 250)) > 0) break;
        await page.waitForTimeout(250);
    }

    const whileAnimating = await countArcsOver(page, 2_000);
    expect(whileAnimating, "the rings were not animating to begin with").toBeGreaterThan(50);

    await page.getByRole("button", { name: "Open field guide" }).click();
    await calmerSwitch(page).click();
    await page.getByRole("button", { name: /^close$/i }).click();
    await page.waitForTimeout(800);

    const whileCalm = await countArcsOver(page, 2_000);
    expect(whileCalm, "the rings kept redrawing after the walker calmed them").toBeLessThan(10);
});
