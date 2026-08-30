/**
 * The calmer-visuals switch has to actually reach the visuals.
 *
 * The switch, the stored preference and the layers that draw are three
 * separate pieces, and a control that saves a preference nothing reads is the
 * easiest version of this feature to ship by accident. Asserted on the ambient
 * gradient, which drops its opacity transition when visuals are calmed, so
 * this fails if the wiring is cut anywhere between the modal and the layer.
 */
import { expect, test, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

const AT_PARK = { latitude: 44.01320393, longitude: -97.11059202 };

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

test("the choice survives a reload", async ({ page }) => {
    await calmerSwitch(page).click();
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await dismissWelcomeModal(page);
    await page.getByRole("button", { name: "Open field guide" }).click();

    // A preference that resets every time the walker reopens the piece is not
    // a preference, and this one is set precisely because a walk is long.
    await expect(calmerSwitch(page)).toHaveAttribute("aria-checked", "true");
    expect(await gradientClass(page)).not.toContain("transition-opacity");
});
