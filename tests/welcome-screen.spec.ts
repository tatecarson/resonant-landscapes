import { test, expect } from '@playwright/test';

test('clicks through the welcome screen and checks if the map loads', async ({ page }) => {
	await page.goto('http://localhost:5173');

	// Click the "Continue" button on the welcome screen
	await page.click('button:has-text("Continue")');

	// Check if the map is visible
	const map = await page.waitForSelector('.map');
	expect(map).toBeTruthy();
});

test('allows location services and checks if the map centers on user location', async ({ page }) => {
	await page.goto('http://localhost:5173');

	// Click the "Continue" button on the welcome screen
	await page.click('button:has-text("Continue")');

	// Allow location services
	await page.context().grantPermissions(['geolocation']);
	await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
});

test('displays an error message when location services are denied', async ({ page }) => {
	await page.goto('http://localhost:5173');

	// Click the "Continue" button on the welcome screen
	await page.click('button:has-text("Continue")');

	// Deny location services
	await page.context().clearPermissions();

	// Check if an error message is displayed
	const errorMessage = await page.waitForSelector('.error-message');
	expect(errorMessage).toBeTruthy();
});