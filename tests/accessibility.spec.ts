/**
 * Accessibility guarantees for text read outdoors, in sunlight, one-handed.
 * These assert measured values (contrast ratios, hit-box pixels) rather than
 * the presence of a class, so a restyle cannot quietly regress them.
 */
import { expect, test, type Page } from "@playwright/test";

const AA_NORMAL = 4.5;
const MIN_TARGET_PX = 44;

/**
 * Dismiss the welcome modal without the shared helper — that file is being
 * changed in another open PR, and duplicating three lines here keeps this
 * branch conflict-free.
 */
async function startWalk(page: Page) {
  await page.getByRole("button", { name: /^\s*start\s*$/i }).click();
}

/** WCAG relative-luminance contrast ratio between two rendered colors. */
const CONTRAST_HELPER = `
  (function () {
    function parse(color) {
      const m = color.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    function chan(c) {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    function lum(c) {
      return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
    }
    function backdrop(el) {
      let node = el;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a === 1) return bg;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    window.__contrastOf = function (el) {
      const fg = parse(getComputedStyle(el).color);
      const bg = backdrop(el);
      // Flatten any text alpha over the first opaque ancestor background.
      const flat = {
        r: fg.a * fg.r + (1 - fg.a) * bg.r,
        g: fg.a * fg.g + (1 - fg.a) * bg.g,
        b: fg.a * fg.b + (1 - fg.a) * bg.b,
      };
      const l1 = lum(flat);
      const l2 = lum(bg);
      const hi = Math.max(l1, l2);
      const lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
  })();
`;

test("the viewport allows pinch zoom and reaches into the safe area", async ({ page }) => {
  await page.goto("/");

  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");

  // Blocking zoom fails WCAG 1.4.4, and outdoors in glare zoom is the whole
  // point. viewport-fit=cover is what makes env(safe-area-inset-*) resolve.
  expect(content).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(content).not.toMatch(/maximum-scale\s*=\s*1/i);
  expect(content).toMatch(/viewport-fit\s*=\s*cover/i);
});

test("welcome copy meets AA contrast against its panel", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ content: CONTRAST_HELPER });

  const failures = await page.evaluate((minRatio) => {
    const panel = document.querySelector("[role=dialog]") ?? document.body;
    const results: { text: string; ratio: number }[] = [];
    for (const el of Array.from(panel.querySelectorAll("p, li, span, h1, h2"))) {
      const text = (el.textContent ?? "").trim();
      // Only real copy: skip empties and single-glyph ornaments.
      if (text.length < 3) continue;
      if (el.querySelector("p, li, span, h1, h2")) continue;
      const ratio = (window as unknown as { __contrastOf: (e: Element) => number })
        .__contrastOf(el);
      if (ratio < minRatio) results.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100 });
    }
    return results;
  }, AA_NORMAL);

  expect(failures, `low-contrast copy: ${JSON.stringify(failures, null, 2)}`).toEqual([]);
});

test("the start control is a full-size touch target", async ({ page }) => {
  await page.goto("/");

  const box = await page.getByRole("button", { name: /^\s*start\s*$/i }).boundingBox();

  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
});

test("entering a park is announced to screen readers", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 44.01271, longitude: -97.11065 });
  await page.addInitScript(() => {
    window.localStorage.setItem("deviceOrientationPermission", "granted");
  });

  await page.goto("/");
  await startWalk(page);

  // The map is lazy-loaded, so its geolocation watch registers after Start.
  // WebKit only emits on change and does not replay an earlier fix, so nudge
  // the position repeatedly the way a real device pushes updates.
  const strip = page.locator("p.font-cormorant").first();
  await expect(async () => {
    await context.setGeolocation({
      latitude: 44.01308 + Math.random() * 1e-5,
      longitude: -97.11062,
    });
    await expect(strip).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  // The park name and distance are conveyed only by sighted layout in the
  // strip. For a sound walk, arriving somewhere is the single most important
  // thing to announce.
  const announcement = page.getByTestId("park-announcement");
  await expect(announcement).toBeAttached();
  await expect(announcement).toContainText(/state park|custer|sica/i);
});

/**
 * Walk the user into a park and wait for the strip. Positions come from the
 * approach-ring spec's scaled debug map; the fix is nudged repeatedly because
 * the app interpolates over a position history and a single fix never renders.
 */
async function walkIntoPark(page: Page, context: import("@playwright/test").BrowserContext) {
  const strip = page.locator("p.font-cormorant").first();
  await expect(async () => {
    await context.setGeolocation({
      latitude: 44.01308 + Math.random() * 1e-5,
      longitude: -97.11062,
    });
    await expect(strip).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("reduced motion", () => {
  // Emulated per-test rather than through test.use: the reducedMotion fixture
  // is not in this Playwright version's typed options.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("holds the compass gradient still instead of sweeping it with heading", async ({ page, context }) => {
    // A full-screen wash at 0.75 alpha whose hue tracks the compass is the
    // vestibular and photosensitivity concern in a walking piece — it moves
    // whenever the walker turns.
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 44.01271, longitude: -97.11065 });
    await page.addInitScript(() => {
      window.localStorage.setItem("deviceOrientationPermission", "granted");
    });

    await page.goto("/");
    await startWalk(page);
    await walkIntoPark(page, context);

    const gradient = page.getByTestId("ambient-gradient");
    await expect(gradient).toBeAttached();

    const read = () => gradient.evaluate((el) => getComputedStyle(el).backgroundImage);
    const before = await read();
    await page.waitForTimeout(1_500);
    const after = await read();

    expect(after).toBe(before);
    // And it must be the quiet form, not the full-strength wash held still.
    if (before !== "none") {
      expect(before).not.toContain("0.75");
    }
  });

  test("stops the CSS animations that run on their own", async ({ page }) => {
    await page.goto("/");

    const durations = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.className = "rotation-affordance";
      document.body.appendChild(probe);
      const style = getComputedStyle(probe);
      const result = {
        animation: style.animationName,
        duration: style.animationDuration,
      };
      probe.remove();
      return result;
    });

    // Either the name is cleared or the duration is collapsed; both count as
    // "not animating", and which one applies depends on rule order.
    expect(durations.animation === "none" || parseFloat(durations.duration) < 0.05).toBe(true);
  });
});

test("announces leaving the listening area, not just arriving", async ({ page, context }) => {
  // The exit announcement cannot live in ParkModal: that unmounts on exit, so
  // the message would leave the DOM before it could be spoken.
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 44.01271, longitude: -97.11065 });
  await page.addInitScript(() => {
    window.localStorage.setItem("deviceOrientationPermission", "granted");
  });

  await page.goto("/");
  await startWalk(page);
  await walkIntoPark(page, context);

  const announcement = page.getByTestId("park-announcement");
  await expect(announcement).toContainText(/entering/i);

  // Back to the starting position, which the approach-ring spec establishes is
  // outside every park. The debug map packs the parks metres apart, so walking
  // an arbitrary distance away lands inside a different one — which announces
  // "Entering ..." rather than leaving, correctly.
  await expect(async () => {
    await context.setGeolocation({
      latitude: 44.01271 + Math.random() * 1e-5,
      longitude: -97.11065,
    });
    await expect(announcement).toContainText(/left the listening area/i, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test("announces audio state on the strip's own code path", async ({ page, context }) => {
  // The visible status label's live region is gated behind
  // !(compact && hideStatusLabel), and the strip passes both — so audio state
  // used to be announced nowhere at all in production.
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 44.01271, longitude: -97.11065 });
  await page.addInitScript(() => {
    window.localStorage.setItem("deviceOrientationPermission", "granted");
  });

  await page.goto("/");
  await startWalk(page);
  await walkIntoPark(page, context);

  const announcement = page.getByTestId("audio-announcement");
  await expect(announcement).toBeAttached();
  await expect(announcement).toContainText(/loading audio|audio playing/i, { timeout: 30_000 });
});
