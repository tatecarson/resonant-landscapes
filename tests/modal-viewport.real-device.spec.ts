/**
 * The rl-uo5 modal-viewport evidence run, on real phones.
 *
 * PR 127's own table was measured on emulated chromium viewports, which do
 * not draw browser chrome: the layout viewport there is the whole screen, so
 * the bug it fixes — inset-0 resolving taller than what the walker can see
 * once Safari's toolbar or Chrome's omnibox is up — cannot be reproduced or
 * disproved by it. Only a real device draws that chrome.
 *
 * This file runs under playwright.browserstack.config.ts (its testMatch is
 * /real-device\.spec\.ts$/, which this filename ends with) and takes the
 * screenshots the acceptance criteria ask for. Run it against two URLs to
 * get the before and after of the same real device:
 *
 *   MODAL_VIEWPORT_LABEL=before \
 *   PLAYWRIGHT_BASE_URL=https://resonant-landscapes.netlify.app \
 *     npm run browserstack:two-devices -- tests/modal-viewport.real-device.spec.ts
 *
 *   MODAL_VIEWPORT_LABEL=after \
 *   PLAYWRIGHT_BASE_URL=https://deploy-preview-127--resonant-landscapes.netlify.app \
 *     npm run browserstack:two-devices -- tests/modal-viewport.real-device.spec.ts
 *
 * Nothing here asserts a pass/fail on the fix. It is a measuring instrument:
 * every run writes screenshots and a numbers file under test-results/, and
 * the comparison is made by reading those. An assertion would decide the
 * question in the code rather than on the phone.
 *
 * No geolocation: BrowserStack's Playwright SDK cannot spoof position on real
 * iOS, and none of this needs a park. The welcome modal is the app's first
 * screen, before any location is asked for.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const LABEL = process.env.MODAL_VIEWPORT_LABEL ?? "run";
/*
 * MODAL_VIEWPORT_OUT, and not test-results, whenever two labels are being
 * compared: Playwright empties its output directory at the start of every
 * run, so a second pass writing under test-results/ deletes the first pass's
 * screenshots before it takes its own. The before/after pair has to land
 * somewhere Playwright does not own.
 */
const OUT_ROOT = process.env.MODAL_VIEWPORT_OUT ?? path.join("test-results", "rl-uo5", LABEL);

/** Matches START and the "Start anyway" a blocked preflight renders. */
const START = /^\s*start(\s+anyway)?\s*$/i;

/*
 * One context for the whole file. BrowserStack's real iOS devices allow
 * exactly one per session — the second test in an iPhone session otherwise
 * dies with "browserstack_error: Only one browser context is allowed" —
 * which is the same reason real-device.spec.ts shares a page.
 */
let page: Page;
/** Filled in by the first test; part of every artifact's filename. */
let device = "unknown-device";

test.beforeAll(async ({ browser }) => {
    // newContext rather than newPage: the SDK's Android patch does not expose
    // browser.newPage, and a context built here does not inherit the config's
    // use.baseURL, so it is passed explicitly.
    const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
    page = await context.newPage();
});

/**
 * A device slug from the user agent, because the platform this session is
 * running on comes from browserstack.yml rather than from anything Playwright
 * hands the test. Two devices write into one directory, so the filenames have
 * to tell them apart.
 */
async function deviceSlug(): Promise<string> {
    const ua = await page.evaluate(() => navigator.userAgent);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const screen = await page.evaluate(() => `${window.screen.width}x${window.screen.height}`);
    if (/iPhone/i.test(ua)) {
        const os = /OS (\d+)[._]/.exec(ua)?.[1] ?? "x";
        // Screen size as well as OS: two iPhones in one run are told apart by
        // their screen, which is the axis this measurement is about.
        return `iphone-ios${os}-${screen}`;
    }
    if (/Android/i.test(ua)) {
        const model = /;\s*([^;)]+)\s+Build\//.exec(ua)?.[1] ?? /Android[^;]*;\s*([^;)]+)/.exec(ua)?.[1] ?? "android";
        return `android-${model.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${screen}`;
    }
    return `ua-dpr${dpr}`;
}

/**
 * What the walker can see, measured inside the page.
 *
 * innerHeight and visualViewport.height are both recorded because they are
 * the two candidate answers to "how tall is the visible area" and they
 * disagree on exactly the platform this bug lives on. The svh probe reads
 * what the CSS in the fix actually resolves to on this device, which is the
 * one number no emulator can be asked for honestly.
 */
async function measure(page: Page) {
    return page.evaluate((startSource) => {
        const startRe = new RegExp(startSource, "i");
        const button = Array.from(document.querySelectorAll("button")).find((element) =>
            startRe.test(element.textContent ?? "")
        );

        // box-sizing:content-box explicitly. Tailwind's preflight sets
        // border-box on everything, under which height:100svh *includes* the
        // padding — so a probe carrying both would report 100svh and then
        // have the safe-area inset subtracted back out of it, which reads as
        // an svh 24px shorter than it is on any device with an inset.
        const probe = document.createElement("div");
        probe.style.cssText =
            "box-sizing:content-box;position:fixed;left:0;top:0;width:0;visibility:hidden;" +
            "pointer-events:none;height:100svh;padding-bottom:env(safe-area-inset-bottom);";
        document.body.appendChild(probe);
        const probed = probe.getBoundingClientRect().height;
        const safeAreaBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
        probe.remove();

        // The modal's scroll container: the element the fix's .modal-viewport
        // child lives inside, and the thing that has to be able to scroll far
        // enough to reach the button.
        const scroller = document.querySelector<HTMLElement>(".fixed.inset-0.overflow-y-auto");
        const viewportChild = document.querySelector<HTMLElement>(".modal-viewport");

        const rect = button?.getBoundingClientRect();
        const visible = window.visualViewport?.height ?? window.innerHeight;

        return {
            innerHeight: window.innerHeight,
            visualViewportHeight: window.visualViewport?.height ?? null,
            // The probe is content-box, so its border-box height is
            // 100svh + the inset; the subtraction gets back to 100svh alone.
            svh100: probed - safeAreaBottom,
            safeAreaBottom,
            documentClientHeight: document.documentElement.clientHeight,
            devicePixelRatio: window.devicePixelRatio,
            hasModalViewportClass: Boolean(viewportChild),
            modalViewportMinHeight: viewportChild ? getComputedStyle(viewportChild).minHeight : null,
            scrollerScrollTop: scroller?.scrollTop ?? null,
            scrollerScrollHeight: scroller?.scrollHeight ?? null,
            scrollerClientHeight: scroller?.clientHeight ?? null,
            startButton: rect
                ? {
                      text: (button?.textContent ?? "").trim(),
                      top: Math.round(rect.top),
                      bottom: Math.round(rect.bottom),
                      height: Math.round(rect.height),
                  }
                : null,
            // The question the whole PR is about, answered in the numbers as
            // well as in the picture beside them.
            startFullyVisible: rect ? rect.top >= 0 && rect.bottom <= visible : null,
            visibleHeightUsed: visible,
        };
    }, START.source);
}

async function shoot(name: string) {
    const file = path.join(OUT_ROOT, `${device}--${name}.png`);
    await mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    return file;
}

const readings: Record<string, unknown> = {};

test("welcome modal: what a real phone shows, before and after scrolling", async () => {
    await page.goto("/");

    const start = page.getByRole("button", { name: START });
    // Attached rather than visible: whether it is in view is the measurement,
    // and toBeVisible would pass on an element sitting under the toolbar.
    await expect(start).toBeAttached({ timeout: 30_000 });
    // The panel animates in (ease-out 300ms); measuring through that would
    // read a transform mid-flight rather than where the button lands.
    await page.waitForTimeout(1_500);

    device = await deviceSlug();

    readings.initial = await measure(page);
    await shoot("01-welcome-initial");

    // Scroll the modal's own container, which is what a walker's thumb moves.
    await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>(".fixed.inset-0.overflow-y-auto");
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" as ScrollBehavior });
    });
    await page.waitForTimeout(1_000);

    readings.scrolledToBottom = await measure(page);
    await shoot("02-welcome-scrolled-to-bottom");

    // And the browser's own best effort, which is what a screen reader or a
    // keyboard focus would trigger — a third state worth a picture.
    await start.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    readings.afterScrollIntoView = await measure(page);
    await shoot("03-welcome-scroll-into-view");
});

test("help modal: the same markup, reached from inside the walk", async () => {
    // The help modal is the same container markup as the welcome modal, so it
    // is the other half of the fix. It lives behind the map, which means
    // getting there costs a START tap; if the walk does not come up on this
    // device the run still keeps the welcome-modal evidence above.
    const start = page.getByRole("button", { name: START });
    await start.click({ timeout: 15_000 }).catch(() => {});
    const help = page.getByRole("button", { name: /help|about|\?/i }).first();

    const helpAppeared = await help
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false);

    if (!helpAppeared) {
        readings.help = { reached: false, note: "help control never appeared after START" };
        test.skip(true, "help control not reachable on this device");
        return;
    }

    await help.click();
    await page.waitForTimeout(1_500);
    readings.help = { reached: true, ...(await measure(page)) };
    await shoot("04-help-initial");

    await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>(".fixed.inset-0.overflow-y-auto");
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" as ScrollBehavior });
    });
    await page.waitForTimeout(1_000);
    await shoot("05-help-scrolled-to-bottom");
});

test.afterAll(async () => {
    // One file per device per label, holding every number the screenshots
    // beside it are the picture of.
    const file = path.join(OUT_ROOT, `${device}--measurements.json`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
        file,
        JSON.stringify({ label: LABEL, device, baseURL: process.env.PLAYWRIGHT_BASE_URL, readings }, null, 2)
    );
    await page?.context().close();
});
