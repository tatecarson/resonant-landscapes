import { expect, type Page } from "@playwright/test";

export async function seedOrientationPermission(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("deviceOrientationPermission", "granted");

    const deviceOrientationCtor = window.DeviceOrientationEvent as IOSDeviceOrientationEvent | undefined;
    if (deviceOrientationCtor && typeof deviceOrientationCtor.requestPermission === "function") {
      Object.defineProperty(deviceOrientationCtor, "requestPermission", {
        configurable: true,
        value: async () => "granted",
      });
    }
  });
}

/**
 * How long the welcome screen is given to close after Start.
 *
 * Start cannot unlock audio until the walk has downloaded its audio engine,
 * so this budget is really a download budget, and 15 seconds was under it.
 * Measured at 15,902 ms on the throttled worst-case profile (pixel-7, 1.6
 * Mbps / 150 ms) — failing by nine hundred milliseconds, which is why the
 * soak never once reached its own assertions (rl-zve). The number below is
 * several times the measurement rather than a little over it: the boot is
 * bandwidth-bound, and a slower runner or a colder cache moves it.
 *
 * Costing nothing is the point. Every other suite closes this modal in well
 * under a second and never comes near this; only a walk that genuinely
 * cannot start waits here, and that is worth reporting slowly and truly
 * rather than quickly and wrongly.
 */
const WELCOME_DISMISS_TIMEOUT_MS = 45_000;

export async function dismissWelcomeModal(page: Page) {
  // Matches the current "Start" label and the older "Begin With Audio".
  const beginButton = page.getByRole("button", { name: /^\s*start\s*$|begin with audio/i });

  // Deliberately no silent early return. When the label became "Start", the
  // old lookup matched nothing and this helper quietly did nothing, leaving the
  // modal up so every spec downstream failed on a map that never rendered —
  // four suites reporting a missing park label for one copy edit.
  await expect(beginButton).toBeVisible({ timeout: 15_000 });
  await beginButton.click();
  await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toHaveCount(
    0,
    { timeout: WELCOME_DISMISS_TIMEOUT_MS }
  );
}
