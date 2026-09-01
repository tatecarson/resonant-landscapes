/**
 * PROTOTYPE (rl-13r / rl-1u7.9). Films four camera behaviours so they can be
 * compared and one chosen. Not a regression test; delete once the decision is
 * made and the real behaviour has its own test.
 *
 *   PLAYWRIGHT_VIDEO=1 npx playwright test tests/zoom-variants.spec.ts --project=iphone-13
 */
import { test, type Page } from "@playwright/test";

/** Hartford Beach, the scaled park the other specs walk to. */
const PARK = { latitude: 44.01320393, longitude: -97.11059202 };

const VARIANTS = [
  { id: "a", name: "A-faithful-rest-19.73-approach-19" },
  { id: "b", name: "B-stated-intent-rest-17.5-approach-19" },
  { id: "c", name: "C-no-auto-zoom-rest-18.5" },
  { id: "d", name: "D-proportional-18-to-19.5" },
];

async function stubWalk(page: Page) {
  await page.addInitScript((park) => {
    const w = window as never as { __setPos?: (m: number) => void };
    let metres = 180;
    const cbs = new Map<number, (f: unknown) => void>();
    let id = 0;
    let drift = 0;
    w.__setPos = (m: number) => { metres = m; };
    const emit = () => {
      drift += 1;
      for (const cb of cbs.values()) {
        cb({
          coords: {
            latitude: park.latitude + metres / 111320 + drift * 0.0000002,
            longitude: park.longitude,
            accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          },
          timestamp: Date.now(),
        });
      }
    };
    window.setInterval(emit, 250);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (cb: (f: unknown) => void) => { id += 1; cbs.set(id, cb); return id; },
        clearWatch: (n: number) => cbs.delete(n),
        getCurrentPosition: emit,
      },
    });
  }, PARK);
}

for (const variant of VARIANTS) {
  test(`camera ${variant.name}`, async ({ page }) => {
    await stubWalk(page);
    await page.goto(`/?debug&zoomMode=${variant.id}`);
    await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
    await page.waitForFunction(
      () => typeof (window as never as { __mapZoom?: number }).__mapZoom === "number",
      null, { timeout: 20_000 }
    );

    const walkTo = async (metres: number, label: string) => {
      await page.evaluate((m) => (window as never as { __setPos: (m: number) => void }).__setPos(m), metres);
      await page.waitForTimeout(3000);
      const zoom = await page.evaluate(() => (window as never as { __mapZoom?: number }).__mapZoom);
      console.log(`[${variant.id}] ${label.padEnd(24)} zoom=${(zoom ?? 0).toFixed(3)}`);
    };

    // The approach, slowly enough to watch.
    await walkTo(180, "180 m: setting off");
    await walkTo(90, "90 m: park ahead");
    await walkTo(38, "38 m: entering range");
    await walkTo(15, "15 m: closing in");
    await walkTo(2, "2 m: at the centre");
    await walkTo(38, "38 m: leaving");
    await walkTo(140, "140 m: walked away");

    // Then the pan story: drag the map, get the Recenter chip, tap it.
    const box = await page.locator(".map").boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 12; i += 1) {
        await page.mouse.move(cx - i * 14, cy - i * 8);
        await page.waitForTimeout(40);
      }
      await page.mouse.up();
      await page.waitForTimeout(2200);
      const chip = page.getByTestId("recenter");
      if (await chip.count()) {
        await chip.click();
        await page.waitForTimeout(2000);
      } else {
        console.log(`[${variant.id}] no recenter chip appeared`);
      }
    }
  });
}
