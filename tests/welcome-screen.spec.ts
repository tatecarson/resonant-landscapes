import { test, expect } from '@playwright/test';

test('clicks through the welcome screen and checks if the map loads', async ({ page }) => {
	await page.goto('http://localhost:5173');

	// Click the "Continue" button on the welcome screen
	await page.click('button:has-text("Continue")');

	// Pause the test execution to inspect the state
	await page.pause();

	// Check if the map is visible
	const map = await page.waitForSelector('.map');
	expect(map).toBeTruthy();
});