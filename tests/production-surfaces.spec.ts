/**
 * Runs against a real production build, which the rest of the suite does not.
 *
 * The debug mirrors, the /debug route and the ?mock= position spoof are gated
 * on import.meta.env.DEV or an explicit ?debug — and every other spec runs
 * against the dev server, where DEV is true and the gate is invisible. Without
 * this, removing the gate would break nothing that anyone runs.
 *
 * Driven by `npm run test:e2e:prod`, which builds and previews first.
 */
import { expect, test } from "@playwright/test";

test("production build hides its debug surfaces", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
  await page.waitForTimeout(2500);

  const plain = await page.evaluate(() => ({
    audio: typeof window.__audioDebug,
    map: typeof window.__mapDebug,
    gimbal: typeof (window as Window).__gimbalOrientation,
    render: typeof window.__renderDebug,
  }));
  console.log("[prod] without ?debug:", JSON.stringify(plain));

  await page.goto("/?debug");
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
  await page.waitForTimeout(2500);
  const withFlag = await page.evaluate(() => ({ audio: typeof window.__audioDebug }));
  console.log("[prod] with ?debug:   ", JSON.stringify(withFlag));

  // Nothing leaks by default...
  expect(plain.audio).toBe("undefined");
  expect(plain.map).toBe("undefined");
  expect(plain.gimbal).toBe("undefined");
  expect(plain.render).toBe("undefined");
  // ...and the mobile suites can still opt in against a deploy preview.
  expect(withFlag.audio).toBe("object");
});

test("production build ignores ?mock= position spoofing", async ({ page }) => {
  // A walk that can be faked from a sofa is not the piece. In dev, and with an
  // explicit ?debug, the spoof still works — that is how the specs drive it.
  await page.goto("/?mock=44.01308,-97.11062");
  await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
  await page.waitForTimeout(3000);

  await expect(page.locator("p.font-cormorant").first()).toHaveCount(0);
});
