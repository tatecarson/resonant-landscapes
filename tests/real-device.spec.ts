/**
 * The real-device column of the support matrix (rl-06c.6).
 *
 * Runs only under playwright.browserstack.config.ts, on BrowserStack's real
 * devices: iPhone Safari across the support floor and two recent majors,
 * Samsung Internet, and Firefox on real Android. It is excluded from the
 * dev-suite runner because every assertion here either pulls ~10-25 MB of
 * real CDN audio per project or is only meaningful on real hardware — that
 * is the BrowserStack run's budget to spend, not CI's.
 *
 * What is deliberately absent: geolocation. BrowserStack's Playwright SDK
 * does not support the geoLocation capability on real iOS devices, and the
 * mechanic that needs position spoofing is already covered end to end by
 * the emulated profiles and the headed simulators. What real devices are
 * uniquely able to answer — the codec path (real iOS Safari ships
 * AudioToolbox, which open-source WebKit lacks), the walk's own preflight,
 * installability, the shell — needs no park to stand in.
 */
import { expect, test } from "@playwright/test";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { pickAssetFamily, selectVariant } from "../src/utils/audioPaths";

const HARTFORD = "Hartford Beach State Park";

test("opens on a real device and passes its own preflight", async ({ page }) => {
    await page.goto("/");

    // "Start anyway" is what the modal renders when the preflight verdict
    // is blocked. Matching it means a device missing a capability fails on
    // the preflight assertion below, which names the missing thing, rather
    // than on a locator timeout that names nothing.
    const beginButton = page.getByRole("button", { name: /^\s*start(\s+anyway)?\s*$/i });
    await expect(beginButton).toBeVisible({ timeout: 30_000 });

    // The walk feature-detects its own requirements and renders
    // data-testid="capability-preflight" only when something is missing.
    // On a supported real device nothing should be missing; on a desktop
    // the one complaint is "a phone", which is not a device fault. The
    // assertable claim is: no codec, audio, or browser problem was found
    // by the engine the device actually runs.
    const userAgent = await page.evaluate(() => navigator.userAgent);
    if (/iPhone|iPad|Android|Mobile/i.test(userAgent)) {
        await expect(page.getByTestId("capability-preflight")).toHaveCount(0);
    }

    await beginButton.click();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
});

test("decodes this device's real spatial file to eight channels", async ({ page }) => {
    // The family the walk serves this device, decided the way the app
    // decides it: by engine, from the user agent the device itself reports.
    // Both the park record and the choice of recording come from the app's
    // own sources — stateParks.json and the seeded selector — so what is
    // fetched is one of the sixteen files a walker in Hartford Beach can
    // actually be served, and renumbering the park's assets moves this test
    // with them instead of leaving it fetching a URL nothing serves.
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const family = pickAssetFamily(userAgent);
    const selected = selectVariant(HARTFORD, stateParks, userAgent);
    if (!selected) throw new Error(`no variants built for ${userAgent}`);

    const [spatialUrl, monoUrl] = selected.urls;
    console.log(
        `${HARTFORD}: recording ${selected.number} of ${selected.total} (${family})`
    );
    // The family decision is unit-tested against known agents; this keeps
    // the test honest about which codec path actually ran on the device.
    expect(spatialUrl).toMatch(family === "aac" ? /_8ch\.m4a$/ : /_8ch\.flac$/);

    // Decode both files of the recording through the device's own decoder,
    // the same call the loader makes. A quiet downmix here — the 8-channel
    // stream collapsing to stereo — is the failure this check exists for:
    // it would otherwise surface in the field as a park that plays but has
    // no space in it.
    const decoded = await page.evaluate(async ([spatialUrl, monoUrl]) => {
        const decode = async (url: string) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
            const bytes = await response.arrayBuffer();
            const context = new AudioContext();
            const buffer = await context.decodeAudioData(bytes);
            return {
                channels: buffer.numberOfChannels,
                sampleRate: buffer.sampleRate,
                seconds: Math.round(buffer.duration),
            };
        };
        return { spatial: await decode(spatialUrl), mono: await decode(monoUrl) };
    }, [spatialUrl, monoUrl]);

    expect(decoded.spatial.channels).toBe(8);
    expect(decoded.mono.channels).toBe(1);
    expect(decoded.spatial.seconds).toBeGreaterThan(0);
});

test("ships a manifest the device can install from", async ({ page, baseURL }) => {
    await page.goto("/");

    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href, "no manifest is linked, so nothing can be installed").toBeTruthy();

    const response = await page.request.get(new URL(href!, baseURL).toString());
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.display).toBe("standalone");
});
