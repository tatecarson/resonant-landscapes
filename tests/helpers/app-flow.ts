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
  const beginButton = page.getByRole("button", { name: /Begin With Audio \+ Motion/i });
  if (!(await beginButton.count())) {
    return;
  }

  await expect(beginButton).toBeVisible({ timeout: 10_000 });
  await beginButton.click();
  await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toHaveCount(0, {
    timeout: 15_000,
  });
}
