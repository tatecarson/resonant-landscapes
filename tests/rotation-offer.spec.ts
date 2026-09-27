/**
 * The rotation offer, found the way a walker with an ordinary phone finds it.
 *
 * A first-time walker at the field test stood at listening spots and never
 * saw "Enable rotation" (rl-edv.5). It needed the live distance to be 3 m or
 * less on every fix, and phone GPS drifts 5 to 15 m with the walker standing
 * still; when it did appear it was 9px text in the corner of the panel, where
 * its arrival read as the placeholder changing.
 *
 * So this stands a walker 4 m from the spot with 8 m reported accuracy, which
 * the old rule never offered at, drifts them to 7 m, and checks the offer is
 * there, sized like the controls beside it, and says what it is for.
 *
 * Orientation permission is deliberately not granted: with it stored, rotation
 * turns itself on and there is no offer to look at.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { dismissWelcomeModal } from "./helpers/app-flow";

const HARTFORD_BEACH_CENTER = { latitude: 44.01320393, longitude: -97.11059202 };
const METRES_PER_DEGREE_LAT = 111_320;
const REPORTED_ACCURACY_M = 8;

function north(metres: number) {
    return {
        latitude: HARTFORD_BEACH_CENTER.latitude + metres / METRES_PER_DEGREE_LAT,
        longitude: HARTFORD_BEACH_CENTER.longitude,
        accuracy: REPORTED_ACCURACY_M,
    };
}

async function standAt(context: BrowserContext, metres: number) {
    await context.setGeolocation(north(metres));
}

test.use({ viewport: { width: 375, height: 667 } });

test("a walker standing near the spot with ordinary GPS is offered rotation, plainly", async ({
    context,
    page,
    baseURL,
}) => {
    if (!baseURL) throw new Error("Missing Playwright baseURL.");

    await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
    await standAt(context, 4);

    await page.goto("/?debug");
    await dismissWelcomeModal(page);
    await page.evaluate(() => window.localStorage.removeItem("deviceOrientationPermission"));

    // Chromium does not re-deliver a position that has not changed, so a
    // watch started after the first setGeolocation can sit with no fix at
    // all. Nudge by centimetres, as real GPS does, until the park opens.
    const parkName = page.locator("p.font-display", { hasText: "Hartford Beach State Park" });
    let nudge = 0;
    await expect(async () => {
        nudge += 1;
        await standAt(context, 4 + nudge * 0.05);
        await expect(parkName).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
        timeout: 20_000,
    }).toBe(true);

    // Offered at 4 m, where the old 3 m rule never offered it.
    const offer = page.getByRole("button", { name: /Enable rotation/i });
    await expect(offer).toBeVisible({ timeout: 10_000 });

    // Said, not just shown.
    const callout = page.getByTestId("rotation-callout");
    await expect(callout).toBeVisible();
    await expect(callout).toHaveAttribute("role", "status");

    // Sized like the Stop button beside it, not like the caption text.
    const stop = page.getByRole("button", { name: /Stop playback/i });
    const [offerBox, stopBox] = await Promise.all([offer.boundingBox(), stop.boundingBox()]);
    expect(offerBox, "the offer has no box").not.toBeNull();
    expect(stopBox, "Stop has no box").not.toBeNull();
    expect(offerBox!.height).toBeGreaterThanOrEqual(44);
    expect(offerBox!.height).toBeCloseTo(stopBox!.height, 0);
    const fontSize = await offer.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(fontSize, "the label is caption-sized").toBeGreaterThanOrEqual(12);

    // Drift to 7 m, well inside ordinary GPS noise. The offer stays put.
    await standAt(context, 7);
    await page.waitForTimeout(2_500);
    await expect(offer).toBeVisible();

    // Tapped, the same control turns on and says so, at the same size. It
    // used to vanish into an 8px tag beside the park name, which truncated
    // the name on this width, and a 9px "stop tracking" link.
    const toggle = page.getByTestId("rotation-toggle");
    await offer.click();
    await expect(toggle).toHaveAttribute("data-state", "on");
    await expect(toggle).toHaveText(/Rotation on/i);
    await expect(page.getByLabel("Spatial tracking active")).toBeVisible();
    await expect(callout).toHaveCount(0);
    const onBox = await toggle.boundingBox();
    expect(onBox!.height).toBeCloseTo(stopBox!.height, 0);
    expect(
        await parkName.evaluate((node) => node.scrollWidth <= node.clientWidth),
        "the park name is truncated",
    ).toBe(true);

    // Tapped again, rotation is off and the offer is back, without repeating
    // the explanation to a walker who just turned it off on purpose.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-state", "off");
    await expect(page.getByLabel("Spatial tracking active")).toHaveCount(0);
    await expect(offer).toBeVisible();
    await expect(callout).toHaveCount(0);
});
