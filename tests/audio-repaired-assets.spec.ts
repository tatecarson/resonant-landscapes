import { expect, test } from '@playwright/test';
import { dismissWelcomeModal, seedOrientationPermission } from './helpers/app-flow';

const cdn = 'https://resonant-landscapes.b-cdn.net/';

test('Good Earth has matching full-length components and an exact W fallback', async ({ page }) => {
    await page.goto('/?debug', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async (base) => {
        const context = new AudioContext({ sampleRate: 44100 });
        const paths = ['sounds-flac/Good-Earth-2-001_8ch.flac',
            'sounds-wav-mono/Good-Earth-2-001_mono.wav',
            'sounds-mono-w/Good-Earth-2-001_w.flac'];
        try {
            const buffers = await Promise.all(paths.map(async path => {
                const response = await fetch(base + path);
                if (!response.ok) throw new Error(`${path}: ${response.status}`);
                return context.decodeAudioData(await response.arrayBuffer());
            }));
            const w = buffers[0].getChannelData(0);
            const fallback = buffers[2].getChannelData(0);
            let maxDifference = 0;
            for (let i = 0; i < w.length; i++) maxDifference = Math.max(maxDifference, Math.abs(w[i] - fallback[i]));
            return { channels: buffers.map(b => b.numberOfChannels),
                lengths: buffers.map(b => b.length), maxDifference };
        } finally {
            await context.close();
        }
    }, cdn);
    expect(result.channels).toEqual([8,1,1]);
    expect(result.lengths).toEqual([2646016,2646016,2646016]);
    expect(result.maxDifference).toBe(0);
});

test('a browser downmix plays the independent W fallback through the player', async ({ page }) => {
    const fallbackRequests: string[] = [];
    page.on('request', request => {
        if (request.url().includes('/sounds-mono-w/')) fallbackRequests.push(request.url());
    });
    await page.addInitScript(() => {
        const native = AudioContext.prototype.decodeAudioData;
        AudioContext.prototype.decodeAudioData = function(data, success, failure) {
            const result = native.call(this, data).then(buffer => {
                if (buffer.numberOfChannels !== 8) return buffer;
                const collapsed = this.createBuffer(2, buffer.length, buffer.sampleRate);
                collapsed.copyToChannel(buffer.getChannelData(0), 0);
                collapsed.copyToChannel(buffer.getChannelData(1), 1);
                return collapsed;
            });
            if (success || failure) void result.then(success, failure);
            return result;
        };
    });
    await seedOrientationPermission(page);
    await page.goto('/?debug&mock=44.013364,-97.110649&ntl-drawer-state=hidden', { waitUntil: 'domcontentloaded' });
    await dismissWelcomeModal(page);
    await expect.poll(() => page.evaluate(() => window.__audioDebug), { timeout: 30000 }).toMatchObject({
        isPlaying: true, bufferChannels: 1, loadError: null,
    });
    expect(fallbackRequests.some(url => url.includes('Sica-Hollow'))).toBe(true);
});
