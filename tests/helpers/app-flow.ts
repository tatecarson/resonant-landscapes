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

export async function dismissWelcomeModal(page: Page) {
  // Matches the current "Start" label and the older "Begin With Audio".
  const beginButton = page.getByRole("button", { name: /^\s*start\s*$|begin with audio/i });

  // Deliberately no silent early return. When the label became "Start", the
  // old lookup matched nothing and this helper quietly did nothing, leaving the
  // modal up so every spec downstream failed on a map that never rendered —
  // four suites reporting a missing park label for one copy edit.
  await expect(beginButton).toBeVisible({ timeout: 15_000 });
  await beginButton.click();
  await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toHaveCount(0, {
    timeout: 15_000,
  });
}
