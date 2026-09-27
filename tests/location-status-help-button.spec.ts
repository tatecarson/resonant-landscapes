/**
 * The location status card must leave the field guide button in view.
 *
 * The card is centred across the top of the map, and on a phone it used to
 * cover the "?" at top right (rl-3if). The button still worked, because the
 * card takes no presses, but it could not be seen, and the field guide is
 * where the help for a failing location lives. The zoom buttons below it are
 * left to pinch zoom and are not checked here.
 */
import { expect, test, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/** Hold geolocation open forever, so the "Finding you…" card stays up. */
async function stubPendingGeolocation(page: Page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: { watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {} },
        });
    });
}

/** Report the permission as denied, for the tallest card: the recovery steps. */
async function stubDenied(page: Page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "permissions", {
            configurable: true,
            value: { query: async () => ({ state: "denied", onchange: null }) },
        });
    });
}

for (const [name, width, height] of [
    ["iPhone SE", 375, 667],
    ["Pixel 7", 412, 915],
] as const) {
    for (const [state, denied] of [
        ["finding you", false],
        ["location blocked, with steps", true],
    ] as const) {
        test(`${name}: the ${state} card leaves the field guide button in view`, async ({ page }) => {
            await page.setViewportSize({ width, height });
            await seedOrientationPermission(page);
            if (denied) await stubDenied(page);
            await stubPendingGeolocation(page);
            await page.goto("/?debug");
            await dismissWelcomeModal(page);

            const card = page.getByTestId("location-status");
            await expect(card).toBeVisible({ timeout: 15_000 });
            const help = page.getByRole("button", { name: /field guide/i });
            await expect(help).toBeVisible();

            const [cardBox, helpBox] = await Promise.all([card.boundingBox(), help.boundingBox()]);
            expect(cardBox, "the card has no box").not.toBeNull();
            expect(helpBox, "the help button has no box").not.toBeNull();
            const overlaps =
                cardBox!.x < helpBox!.x + helpBox!.width &&
                cardBox!.x + cardBox!.width > helpBox!.x &&
                cardBox!.y < helpBox!.y + helpBox!.height &&
                cardBox!.y + cardBox!.height > helpBox!.y;
            expect(overlaps, "the card covers the field guide button").toBe(false);

            // And the card itself still fits on screen, left and right.
            expect(cardBox!.x).toBeGreaterThanOrEqual(0);
            expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(width);
        });
    }
}
