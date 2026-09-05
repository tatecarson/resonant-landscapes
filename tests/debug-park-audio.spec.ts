import { expect, test } from '@playwright/test';

// The test holds a fetch to prove that the unlock button remains usable during
// loading. WebKit cannot intercept service-worker-mediated fetches.
test.use({ serviceWorkers: 'block' });

test('a direct debug visit can unlock during loading and play the audited recording', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let requested = '';
    await page.route('https://resonant-landscapes.b-cdn.net/**', async route => {
        requested = route.request().url();
        await held;
        await route.continue();
    });
    await page.goto('/terrace/debug?debug&mock=43.552725,-96.741620&ntl-drawer-state=hidden', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('p.font-cormorant').filter({ hasText: /^Current Location Test$/ })).toBeVisible();
    try {
        await expect.poll(() => requested).toContain('Custer-State-1-002');
        await expect.poll(() => page.evaluate(() => window.__audioDebug?.isLoading)).toBe(true);
        await page.getByRole('button', { name: 'Start playback fallback', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__audioDebug?.isAudioUnlocked)).toBe(true);
    } finally {
        release();
    }
    await expect.poll(() => page.evaluate(() => window.__audioDebug), { timeout: 30000 }).toMatchObject({
        hasBuffers: true, bufferChannels: 9, isPlaying: true, contextState: 'running', loadError: null,
    });
    const urls = await page.evaluate(() => window.__audioDebug?.activeUrls);
    expect(urls).toHaveLength(2);
    expect(urls?.every(url => url.includes('Custer-State-1-002'))).toBe(true);
});
