import { expect, test } from "@playwright/test";
import { buildSync } from "esbuild";
import { resolve } from "node:path";

// Exercise the same factory/router as the player with an actual Web Audio
// renderer. No CDN, GPS or room noise can obscure the channel/rotation check.
const bundle = buildSync({
    stdin: { contents: 'export * from "./src/audio/soundfield";', resolveDir: resolve(".") },
    bundle: true, format: "iife", globalName: "SoundfieldUnderTest", write: false,
}).outputFiles[0].text;

test("preserves second order and turns right/above soundfields into front when the listener turns", async ({ page }) => {
    await page.goto("/?debug", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(async () => {
        const engine = (window as unknown as {
            SoundfieldUnderTest: typeof import("../src/audio/soundfield");
        }).SoundfieldUnderTest;
        async function render(coefficients: number[], forward: number[], up: number[], distance = 0) {
            const ctx = new OfflineAudioContext(9, 8192, 48000);
            const scene = await engine.createSoundfieldScene(ctx as unknown as AudioContext);
            const privateScene = scene as unknown as { _listener: { _renderer: { _isRendererReady: boolean } } };
            const deadline = performance.now() + 10000;
            while (!privateScene._listener._renderer._isRendererReady) {
                if (performance.now() > deadline) throw new Error("Ambisonic decoder did not initialize");
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            engine.setSoundfieldOrientation(scene, forward, up);
            // Rotated harmonics before the binaural convolution, so compare the
            // geometry independently of the listener's HRTF or output device.
            scene.ambisonicOutput.channelCount = 9;
            scene.ambisonicOutput.channelCountMode = "explicit";
            scene.ambisonicOutput.channelInterpretation = "discrete";
            scene.ambisonicOutput.connect(ctx.destination);
            const router = engine.createSoundfieldInput(ctx, scene);
            router.setDistance(distance);
            const buffer = ctx.createBuffer(9, 8192, 48000);
            coefficients.forEach((value, channel) => { buffer.getChannelData(channel)[8000] = value; });
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(router.inputForChannels(9));
            source.start();
            const output = await ctx.startRendering();
            return Array.from({ length: 9 }, (_, c) => output.getChannelData(c)[8000]);
        }
        // ACN/SN3D cardinal plane waves, derived analytically. Web Audio forward
        // is -Z, right is +X and up is +Y. Ambisonic X=front, Y=left, Z=up.
        const root3 = Math.sqrt(3);
        const front = [1,0,0,1,0,0,-0.5,0,root3/2];
        const right = [1,-1,0,0,0,0,-0.5,0,-root3/2];
        const above = [1,0,1,0,0,0,1,0,0];
        return {
            front: await render(front, [0,0,-1], [0,1,0]),
            rightTurned: await render(right, [1,0,0], [0,1,0]),
            aboveTilted: await render(above, [0,1,0], [0,0,1]),
            secondOrderOnly: await render([0,0,0,0,0,0,0,0,1], [0,0,-1], [0,1,0]),
            distant: await render(front, [0,0,-1], [0,1,0], 10),
        };
    });
    console.log(JSON.stringify(result));
    const front = [1,0,0,1,0,0,-0.5,0,Math.sqrt(3)/2];
    result.front.forEach((value, c) => expect(value).toBeCloseTo(front[c], 4));
    result.rightTurned.forEach((value, c) => expect(value).toBeCloseTo(front[c], 4));
    result.aboveTilted.forEach((value, c) => expect(value).toBeCloseTo(front[c], 4));
    expect(result.secondOrderOnly[8]).toBeCloseTo(1, 4);
    result.secondOrderOnly.slice(0,8).forEach(value => expect(value).toBeCloseTo(0, 4));
    // Gain at 10m has settled for ~167ms, allowing the documented 50ms smoothing.
    expect(result.distant[0]).toBeLessThan(0.14);
    expect(result.distant[0]).toBeGreaterThan(0.09);
});
