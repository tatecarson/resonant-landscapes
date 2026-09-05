/**
 * The walk opens with no signal, and says only what is true about it.
 *
 * Runs against the production build because the service worker does not
 * exist in dev: vite-plugin-pwa leaves it out, so the same assertions run
 * against `npm run dev` would pass while proving nothing.
 *
 * Since rl-1u7.8.2 the walk holds recordings it has fetched, and the
 * offline-replay spec (offline-audio.spec.ts) asserts that a park it holds
 * actually plays with no signal. This file keeps asserting the copy: the
 * promise stays conditional — what was saved replays, what was never
 * downloaded does not — and never widens into "works offline".
 */
import { expect, test, type Page } from "@playwright/test";

/** Wait until a worker is actually controlling the page, not merely registered. */
async function waitForController(page: Page) {
    await page.waitForFunction(
        () => Boolean(navigator.serviceWorker?.controller),
        undefined,
        { timeout: 30_000 }
    );
}

test("ships a manifest a phone can install from", async ({ page, baseURL }) => {
    await page.goto("/");

    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href, "no manifest is linked, so nothing can be installed").toBeTruthy();

    const response = await page.request.get(new URL(href!, baseURL).toString());
    expect(response.ok()).toBe(true);
    const manifest = await response.json();

    expect(manifest.name).toBe("Resonant Landscapes");
    expect(manifest.display).toBe("standalone");
    // A home screen icon is the point of installing; a manifest without one
    // gets a screenshot of the page, which on a map is a grey rectangle.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(
        manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable"),
        "no maskable icon, so Android crops the mark"
    ).toBe(true);

    for (const icon of manifest.icons) {
        const iconResponse = await page.request.get(new URL(icon.src, baseURL).toString());
        expect(iconResponse.ok(), `${icon.src} is listed but not served`).toBe(true);
    }
});

test("carries the iOS home screen icon the manifest cannot provide", async ({ page, baseURL }) => {
    // iOS ignores the manifest icon list for a home screen install and reads
    // apple-touch-icon instead, so a walk installed from an iPhone would have
    // shown a screenshot of the map without this.
    await page.goto("/");

    const href = await page.getAttribute('link[rel="apple-touch-icon"]', "href");
    expect(href).toBeTruthy();
    const response = await page.request.get(new URL(href!, baseURL).toString());
    expect(response.ok()).toBe(true);
});

test("opens with the network off instead of the browser error page", async ({ page, context }) => {
    await page.goto("/");
    await waitForController(page);

    await context.setOffline(true);
    await page.reload();

    // The welcome screen is the shell. If the worker were not serving it,
    // this would be Chrome's dinosaur.
    await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toBeVisible({
        timeout: 15_000,
    });
});

test("says what is actually true with no signal", async ({ page, context }) => {
    await page.goto("/");
    await waitForController(page);

    await context.setOffline(true);

    const notice = page.getByTestId("offline-notice");
    await expect(notice).toBeVisible({ timeout: 10_000 });

    // The promise this holds: saved recordings replay, nothing is claimed
    // about recordings the walk never downloaded, and the claim never
    // widens into a blanket "works offline". An unconditional promise would
    // be the same class of lie as the strip reporting playback into a
    // silenced phone — a first visit held entirely offline plays nothing.
    await expect(notice).toContainText(/no signal/i);
    await expect(notice).toContainText(/already saved/i);
    await expect(notice).toContainText(/will not download/i);
    await expect(notice).not.toContainText(/works offline|available offline|fully offline/i);

    await context.setOffline(false);
    await expect(notice).toHaveCount(0, { timeout: 10_000 });
});

test("keeps the debug surfaces gated once a worker is serving the page", async ({ page }) => {
    /*
     * production-surfaces.spec.ts asserts these on a first load. A precached
     * shell serves the same HTML from disk afterwards, so this re-checks the
     * guarantee on the path a returning walker actually takes. A worker
     * pinning an older bundle would not fail that spec; it would silently
     * test a build nobody is running.
     *
     * The two navigations are deliberate, not mixed by accident (rl-9ek.4).
     * This spec runs under playwright.prod.config.ts, where the gate is
     * real, so the reads split by which page they land on: after the bare
     * goto, typeof "undefined" is the assertion's point — the walker-facing
     * path must expose no mirrors. Then /?debug proves the mirrors are
     * still reachable when a page asks for them, in this same production
     * build. Reading them after the bare goto instead would assert nothing
     * and pass forever.
     */
    await page.goto("/");
    await waitForController(page);
    await page.reload();

    expect(await page.evaluate(() => typeof window.__audioDebug)).toBe("undefined");
    expect(await page.evaluate(() => typeof window.__mapDebug)).toBe("undefined");

    await page.goto("/?debug");
    await expect
        .poll(async () => page.evaluate(() => typeof window.__audioDebug), { timeout: 15_000 })
        .toBe("object");
});
