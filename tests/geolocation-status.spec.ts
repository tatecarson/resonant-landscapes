/**
 * Covers what the walker sees when location is not working yet.
 * Before this, a denied permission or a slow first fix left the map sitting at
 * Null Island with no explanation, so these assert the app says something.
 */
import { expect, test, type Page } from "@playwright/test";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";

/** Hold geolocation open forever: permission is fine, no fix has arrived. */
async function stubPendingGeolocation(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: () => 1,
        clearWatch: () => {},
        getCurrentPosition: () => {},
      },
    });
  });
}

/** Report a fixed Permissions API state for geolocation. */
async function stubPermissionState(page: Page, state: string) {
  await page.addInitScript((permissionState) => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: async () => ({ state: permissionState, onchange: null }),
      },
    });
  }, state);
}

async function openMap(page: Page) {
  await page.goto("/");
  await dismissWelcomeModal(page);
}

test.beforeEach(async ({ page }) => {
  await seedOrientationPermission(page);
});

test("tells the walker it is still finding them before the first fix", async ({ page }) => {
  await stubPendingGeolocation(page);
  await openMap(page);

  await expect(page.getByTestId("location-status")).toContainText(/finding you/i, {
    timeout: 15_000,
  });
});

test("explains a denied location permission and how to recover", async ({ page }) => {
  await stubPermissionState(page, "denied");
  await stubPendingGeolocation(page);
  await openMap(page);

  const status = page.getByTestId("location-status");
  await expect(status).toContainText(/location is blocked/i, { timeout: 15_000 });
  // The walker is outdoors and needs to know where to go, not just that it broke.
  await expect(status).toContainText(/settings/i);
});

test("stops claiming to be searching when no fix ever arrives", async ({ page }) => {
  // Permission is fine and the watch simply never calls back — the common
  // outdoor failure, which produces no error event to react to.
  await stubPermissionState(page, "granted");
  await stubPendingGeolocation(page);
  await openMap(page);

  const status = page.getByTestId("location-status");
  await expect(status).toContainText(/finding you/i, { timeout: 15_000 });
  await expect(status).toContainText(/can't find your location/i, { timeout: 25_000 });
  await expect(status).not.toContainText(/blocked/i);
});

test("clears the acquiring message once a fix arrives", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 44.013, longitude: -97.110649 });
  await openMap(page);

  // WebKit does not replay a position set before the page loaded to a
  // watchPosition registered afterwards; it emits on change. Real GPS pushes
  // updates continuously, so nudge the fix here the way a device would.
  await context.setGeolocation({ latitude: 44.0131, longitude: -97.110649 });

  await expect(page.getByTestId("location-status")).toHaveCount(0, { timeout: 20_000 });
});

/**
 * Feed positions from a controllable stub: Playwright's setGeolocation cannot
 * express accuracy, and it cannot stop delivering fixes without also clearing
 * the permission.
 *
 * Fixes repeat on an interval because the app interpolates over a position
 * history — a single fix never renders, which is why the tests above nudge the
 * position after load.
 */
async function stubControllableGeolocation(
  page: Page,
  { accuracy, latitude = 44.013, longitude = -97.110649 }: {
    accuracy: number;
    /** Defaults to the DSU walk, next to Hartford Beach. */
    latitude?: number;
    longitude?: number;
  }
) {
  await page.addInitScript(({ accuracyMeters, originLatitude, originLongitude }) => {
    let watchId = 0;
    let step = 0;
    const callbacks = new Map<number, (position: unknown) => void>();

    const emit = () => {
      // Drift a metre or so per fix: a stationary walker is indistinguishable
      // from a frozen watch, which is the very thing under test.
      step += 1;
      for (const callback of callbacks.values()) {
        callback({
          coords: {
            latitude: originLatitude + step * 0.00001,
            longitude: originLongitude,
            accuracy: accuracyMeters,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      }
    };

    const interval = window.setInterval(emit, 250);

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (callback: (position: unknown) => void) => {
          watchId += 1;
          callbacks.set(watchId, callback);
          return watchId;
        },
        clearWatch: (id: number) => callbacks.delete(id),
        getCurrentPosition: emit,
      },
    });

    (window as Window & { __stopFixes?: () => void }).__stopFixes = () => {
      window.clearInterval(interval);
    };
  }, { accuracyMeters: accuracy, originLatitude: latitude, originLongitude: longitude });
}

/** Stop delivering fixes without erroring — the tree-cover failure. */
async function stopFixes(page: Page) {
  await page.evaluate(() => {
    (window as Window & { __stopFixes?: () => void }).__stopFixes?.();
  });
}

test("warns when GPS accuracy is wider than the listening areas", async ({ page, context }) => {
  // ±30 m under tree cover against a 15 m enter radius: parks appear to
  // trigger and drop at random, and the walker deserves to know why.
  await context.grantPermissions(["geolocation"]);
  await stubControllableGeolocation(page, { accuracy: 30 });
  await openMap(page);

  const status = page.getByTestId("location-status");
  await expect(status).toContainText(/imprecise/i, { timeout: 20_000 });
  // The number is the point: it separates "drifting" from "useless here".
  await expect(status).toContainText(/30 m/);
});

test("stays quiet about a coarse fix when no park is near enough to care", async ({ page, context }) => {
  // rl-u18. A cold start hands back network or cell positions tens of metres
  // wide, and the walker sees them at home before setting out. Warning there
  // is warning about nothing, and it spends the credibility the same banner
  // needs later, under tree cover, when it explains why a park will not start.
  await context.grantPermissions(["geolocation"]);
  await stubControllableGeolocation(page, {
    accuracy: 30,
    // ~780 m north of the walk: well outside the 40 m prefetch range of every
    // park, so accuracy cannot decide anything here.
    latitude: 44.02,
    longitude: -97.110649,
  });
  await openMap(page);

  // Prove a fix was actually consumed before asserting silence. toHaveCount(0)
  // is otherwise satisfied by a page that never registered the watch at all,
  // which would be a test that passes for the wrong reason.
  await expect
    .poll(() => page.evaluate(() => window.__mapDebug?.position ?? null), {
      timeout: 20_000,
      message: "the 30 m fix was never processed, so silence proves nothing",
    })
    .not.toBeNull();

  // Then long enough that a banner would have appeared if it were coming.
  // Asserting absence rather than "not imprecise": a locator that matches
  // nothing satisfies not.toContainText for the wrong reason, and any banner
  // over an untroubled walk is a problem whatever it says.
  await page.waitForTimeout(4_000);
  await expect(page.getByTestId("location-status")).toHaveCount(0);
});

test("stays quiet when GPS accuracy is good enough for the geofences", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await stubControllableGeolocation(page, { accuracy: 5 });
  await openMap(page);

  await expect(page.getByTestId("location-status")).toHaveCount(0, { timeout: 20_000 });
});

test("says the signal is lost when fixes stop arriving", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await stubControllableGeolocation(page, { accuracy: 5 });
  await openMap(page);

  await expect(page.getByTestId("location-status")).toHaveCount(0, { timeout: 20_000 });

  // A fix landed, then nothing. No error fires, so without the watchdog the
  // blue dot just sits there looking authoritative.
  await stopFixes(page);

  await expect(page.getByTestId("location-status")).toContainText(/signal lost/i, {
    timeout: 25_000,
  });
});
