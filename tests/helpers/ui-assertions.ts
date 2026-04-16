import { expect, type Page } from "@playwright/test";

export async function expectParkLabelVisible(page: Page, parkName: string) {
  const heading = page.getByRole("heading", { name: parkName });
  if (await heading.count()) {
    await expect(heading).toBeVisible({ timeout: 15_000 });
    return;
  }

  const compactLabel = page.locator("p.font-cormorant", { hasText: parkName });
  await expect(compactLabel).toBeVisible({ timeout: 15_000 });
}

export async function expectAudioStatusVisible(page: Page, statusLabel: string) {
  const status = page.locator("p.font-space-mono", { hasText: statusLabel });
  await expect(status.first()).toBeVisible({ timeout: 15_000 });
}
