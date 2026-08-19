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

  await expect(page.getByTestId("location-status")).toHaveCount(0, { timeout: 20_000 });
});
