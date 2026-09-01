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
/**
 * The two decorative layers are mutually exclusive, so each needs its own
 * position. ProximityRingLayer is active in prefetch range and outside the
 * park; SunRayLayer is active only once inside it.
 */
/** 31 m: inside prefetch range, outside the park. Rings pulse here. */
const APPROACHING = { latitude: 44.01292, longitude: -97.11059202 };

/**
 * Extra dwell so a recorded run is watchable. The default is 0 because CI
 * gains nothing from waiting; `npm run demo:calmer` sets it. Same idea as
 * APPROACH_RING_HOLD_MS in approach-ring.spec.ts.
 */
const HOLD_MS = Number(process.env.REDUCE_VISUALS_HOLD_MS ?? 0);
const hold = (page: Page) => (HOLD_MS ? page.waitForTimeout(HOLD_MS) : Promise.resolve());

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

    await hold(page);
    const whileAnimating = await countArcsOver(page, 2_000);
    expect(whileAnimating, "the rings were not animating to begin with").toBeGreaterThan(50);

    await page.getByRole("button", { name: "Open field guide" }).click();
    await hold(page);
    await calmerSwitch(page).click();
    await hold(page);
    await page.getByRole("button", { name: /^close$/i }).click();
    await page.waitForTimeout(800);

    const whileCalm = await countArcsOver(page, 2_000);
    expect(whileCalm, "the rings kept redrawing after the walker calmed them").toBeLessThan(10);
    await hold(page);
});

test("calming the visuals stops the rays inside a park too", async ({ context, page }) => {
    // SunRayLayer, which the ring test never reaches: it is active only once
    // parkName is set, and the rings are active only while it is not. Walking
    // in is the whole difference between the two.
    await instrumentArcs(page);
    await context.setGeolocation(AT_PARK);
    await page.goto("/");
    await dismissWelcomeModal(page);
    await walkIntoParkUntilGradient(context, page);

    // The strip is proof the rays are the layer drawing, not the rings.
    await expect(page.locator("p.font-cormorant").first()).toBeVisible({ timeout: 30_000 });
    await hold(page);

    const whileAnimating = await countArcsOver(page, 2_000);
    expect(whileAnimating, "the rays were not animating to begin with").toBeGreaterThan(50);

    await page.getByRole("button", { name: "Open field guide" }).click();
    await hold(page);
    await calmerSwitch(page).click();
    await hold(page);
    await page.getByRole("button", { name: /^close$/i }).click();
    await page.waitForTimeout(800);

    const whileCalm = await countArcsOver(page, 2_000);
    expect(whileCalm, "the rays kept redrawing after the walker calmed them").toBeLessThan(10);
    await hold(page);
});

/**
 * The half of the switch that was doing nothing.
 *
 * The specs above all assert on layers that read the preference in
 * JavaScript, and they passed while everything expressed in CSS ignored the
 * switch entirely: the rotation affordance kept breathing, the playing dot
 * kept pulsing, the modal transitions kept running. A media query only knows
 * the system setting, and this preference is explicitly allowed to beat the
 * system in both directions, so nothing in a stylesheet could see it.
 *
 * Asserted through a probe carrying the real .rotation-affordance class
 * rather than the button itself, because that button needs a walker standing
 * at a rotation centre with orientation granted. The rule under test is the
 * shipped one either way, and what is being checked is whether the ancestor
 * attribute reaches it.
 */
async function animationOfProbe(page: Page) {
    return page.evaluate(() => {
        let probe = document.getElementById("motion-probe");
        if (!probe) {
            probe = document.createElement("div");
            probe.id = "motion-probe";
            probe.className = "rotation-affordance";
            document.body.appendChild(probe);
        }
        const style = window.getComputedStyle(probe);
        return {
            name: style.animationName,
            duration: style.animationDuration,
            motion: document.documentElement.getAttribute("data-motion"),
        };
    });
}

test("calming the visuals reaches the CSS animations too, not just the canvas", async ({ page }) => {
    const animating = await animationOfProbe(page);
    expect(animating.motion, "the effective preference never reached the document").toBe("full");
    expect(animating.name, "the affordance was not animating to begin with").toBe(
        "rotation-affordance-breathe"
    );

    await calmerSwitch(page).click();
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");

    await expect
        .poll(async () => (await animationOfProbe(page)).motion, { timeout: 5_000 })
        .toBe("calm");
    const calmed = await animationOfProbe(page);
    expect(calmed.name, "the rotation affordance kept breathing after the walker calmed it").toBe(
        "none"
    );
});

test("the global duration override follows the switch as well", async ({ page }) => {
    // index.css calms every animation and transition, not only the ones it
    // names, because this is a screen held at walking pace outdoors. That
    // block was behind the media query too, so a walker who set the
    // preference here and nowhere else got none of it.
    const duration = () =>
        page.evaluate(() => {
            let probe = document.getElementById("duration-probe");
            if (!probe) {
                probe = document.createElement("div");
                probe.id = "duration-probe";
                probe.style.animation = "spin 4s linear infinite";
                document.body.appendChild(probe);
            }
            // Parsed rather than compared as a string: browsers serialise
            // 0.01ms differently (Chromium says "1e-05s"), and the promise
            // here is that the animation is over before it is seen, not that
            // it is spelled a particular way.
            return Number.parseFloat(window.getComputedStyle(probe).animationDuration);
        });

    expect(await duration()).toBeCloseTo(4);

    await calmerSwitch(page).click();
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");

    await expect.poll(duration, { timeout: 5_000 }).toBeLessThan(0.001);
});

test("an explicit choice for the full visuals beats the phone", async ({ page }) => {
    // The direction a media query cannot express, and the reason the attribute
    // has to be authoritative rather than OR'd with the query. Someone with
    // reduce motion on everywhere can still ask for the whole piece here,
    // which is what useReduceVisuals promises in prose.
    //
    // The system setting is turned on mid-walk rather than at launch, because
    // Playwright's reducedMotion fixture does not reach matchMedia in this
    // setup. That is the better test anyway: iOS and Android both expose this
    // as a toggle someone flips precisely because something on screen has
    // started bothering them, and the app claims to follow it live.
    await page.emulateMedia({ reducedMotion: "reduce" });

    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect
        .poll(async () => (await animationOfProbe(page)).motion, { timeout: 5_000 })
        .toBe("calm");

    await calmerSwitch(page).click();

    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect
        .poll(async () => (await animationOfProbe(page)).motion, { timeout: 5_000 })
        .toBe("full");
    expect(
        (await animationOfProbe(page)).name,
        "the walker asked for the full visuals and the stylesheet kept obeying the phone"
    ).toBe("rotation-affordance-breathe");
});
