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

test("production build gates /debug, and ?debug still opens it", async ({ page }) => {
  const welcomeStart = () => page.getByRole("button", { name: /^\s*start\s*$/i });

  // Gated: these land on the ordinary walk, not the debug tools.
  for (const gated of ["/debug", "/#/debug"]) {
    await page.goto(gated);
    await expect(welcomeStart(), `${gated} should show the walk`).toBeVisible({ timeout: 10_000 });
  }

  // Opted in: all three spellings work, including the hash carrying its own
  // query string, which used to fall through to the ordinary app in silence.
  for (const open of ["/debug?debug", "/#/debug?debug", "/?debug#/debug"]) {
    await page.goto(open);
    await page.waitForTimeout(500);
    await expect(welcomeStart(), `${open} should reach the debug route`).toHaveCount(0);
  }
});

test("production build keeps the unlock exception off the welcome screen", async ({ page }) => {
  // WelcomeModal used to render the exception straight into the dialog. It is
  // now behind the same gate as everything else here, which means the dev
  // server the rest of the suite runs against cannot prove it is gone.
  const message = "NotAllowedError: The request is not allowed by the user agent";
  await page.addInitScript((text) => {
    Object.defineProperty(window.BaseAudioContext.prototype, "state", {
      configurable: true,
      get: () => "suspended",
    });
    window.AudioContext.prototype.resume = () => Promise.reject(new Error(text));
  }, message);

  await page.goto("/");
  await page.getByRole("button", { name: /^\s*start\s*$/i }).click();

  const failure = page.getByTestId("unlock-error");
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(/press start again/i);
  await expect(failure).not.toContainText(message);
  await expect(page.getByTestId("unlock-error-detail")).toHaveCount(0);

  // ...and someone debugging a real phone can still opt back in.
  await page.goto("/?debug");
  await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
  await expect(page.getByTestId("unlock-error-detail")).toContainText(message);
});
