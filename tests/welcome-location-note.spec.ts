/**
 * The welcome screen says to turn location on before it can fail (rl-edv.2).
 *
 * The field-test walker met location only as an error, at a listening spot,
 * and asked for a note up front. It names the platform's own Settings path,
 * and it must not cost the first-screen START that rl-uo5 fought for.
 */
import { expect, test } from "@playwright/test";

const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";

for (const [platform, userAgent, path] of [
    ["iPhone", IPHONE_UA, "Settings → Privacy & Security → Location Services"],
    ["Android", ANDROID_UA, "Settings → Location"],
] as const) {
    test.describe(platform, () => {
        // The smallest measured phone screen from modal-panel-reach.spec.ts.
        test.use({ userAgent, viewport: { width: 375, height: 548 } });

        test(`the welcome screen tells a ${platform} walker where to turn location on`, async ({ page }) => {
            await page.goto("/");
            const note = page.getByTestId("welcome-location-note");
            await expect(note).toContainText("Before you start");
            await expect(note).toContainText(path);

            // On the first screen of the smallest phone, not under the fold
            // where a walker can tap Start without meeting it.
            const noteBox = await note.boundingBox();
            expect(noteBox, "the note has no box").not.toBeNull();
            // The fold is where the sticky footer's fade begins, not Start
            // itself: the footer, its "more below" cue and the 32 px fade
            // above it all cover prose.
            const foldY = await page
                .getByRole("button", { name: /^\s*start\s*$|start anyway/i })
                .evaluate((button) => {
                    const footer = button.closest(".sticky");
                    const fade = footer?.querySelector('[aria-hidden="true"].bg-gradient-to-t');
                    return (fade ?? footer ?? button).getBoundingClientRect().top;
                });
            expect(noteBox!.y + noteBox!.height, "the note is under the fold").toBeLessThanOrEqual(foldY);

            // START is still on the first screen, without scrolling.
            const start = page.getByRole("button", { name: /^\s*start\s*$|start anyway/i });
            const box = await start.boundingBox();
            expect(box, "START has no box").not.toBeNull();
            expect(box!.y + box!.height).toBeLessThanOrEqual(548);
        });
    });
}
