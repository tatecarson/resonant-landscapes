import { test, expect } from '@playwright/test';

test('hello world!', async ({ page }) => {
	await page.goto('http://localhost:3000');
	expect(await page.title()).toBe('Expected Title');
});