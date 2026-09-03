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
import { expect, test, type Page } from "@playwright/test";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { pickAssetFamily, selectVariant } from "../src/utils/audioPaths";

const HARTFORD = "Hartford Beach State Park";

/** What the in-page decoder reports back for one recording's two files. */
type ChannelLevel = { rms: number; peak: number };
type Decoded = {
    channels: number;
    sampleRate: number;
    seconds: number;
    /** Measured per channel, so silence and a downmix can be told apart. */
    levels: ChannelLevel[];
};
type DecodedPair = {
    spatial: Decoded;
    mono: Decoded;
    /** Spatial channels that are a sample-for-sample copy of channel 0. */
    copiesOfFirstChannel: number;
};

/*
 * One page for the whole file, deliberately.
 *
 * Playwright opens a fresh context per test, and BrowserStack's real iOS
 * devices allow exactly one per session: the second test in an iPhone session
 * fails with "browserstack_error: Only one browser context is allowed" before
 * it runs a line. Sharing one context costs the isolation between these three
 * tests — which each navigate for themselves anyway — and buys the ability to
 * run more than one test per device.
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
    // newContext, not newPage: the SDK's Android patch does not expose
    // browser.newPage at all ("browser.newPage is not a function"), and
    // newContext is the call it does patch on both platforms.
    // baseURL explicitly: a context built here does not inherit the config's
    // use.baseURL the way Playwright's own page fixture does, and without it
    // every goto("/") is "Cannot navigate to invalid URL". The runner config
    // refuses to start unless PLAYWRIGHT_BASE_URL is set, so it is here.
    const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
    page = await context.newPage();
});

test.afterAll(async () => {
    await page?.context().close();
});

test("opens on a real device and passes its own preflight", async () => {
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

test("decodes this device's real spatial file to eight channels", async () => {
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
    // The URLs travel in the fragment, not in a page.evaluate argument.
    // BrowserStack's real-iOS driver mishandles that argument in every shape
    // — an array arrives non-iterable, an object throws "URL is not valid",
    // a string is evaluated as the expression itself — and the string-source
    // workarounds that satisfy iOS return undefined on Android, which wants
    // the opposite shape. A plain no-argument function is the one form both
    // engines agree on, so what it needs is put where it can read it.
    await page.goto(`/#decode=${encodeURIComponent(JSON.stringify({ spatialUrl, monoUrl }))}`);

    const decoded = await page.evaluate(async (): Promise<DecodedPair> => {
        const { spatialUrl, monoUrl } = JSON.parse(
            decodeURIComponent(window.location.hash.replace(/^#decode=/, ""))
        ) as { spatialUrl: string; monoUrl: string };

        const decode = async (url: string) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
            const bytes = await response.arrayBuffer();
            const context = new AudioContext();
            const buffer = await context.decodeAudioData(bytes);

            // Sampled, not exhaustive: a stride keeps this cheap enough for the
            // budget phone in the matrix, and silence is silence at any stride.
            const wanted = 50_000;
            const stride = Math.max(1, Math.floor(buffer.length / wanted));
            const samples: number[][] = [];
            const levels = [];

            for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
                const data = buffer.getChannelData(channel);
                const taken: number[] = [];
                let sumOfSquares = 0;
                let peak = 0;

                for (let index = 0; index < data.length; index += stride) {
                    const value = data[index];
                    taken.push(value);
                    sumOfSquares += value * value;
                    peak = Math.max(peak, Math.abs(value));
                }

                samples.push(taken);
                levels.push({ rms: Math.sqrt(sumOfSquares / taken.length), peak });
            }

            return {
                summary: {
                    channels: buffer.numberOfChannels,
                    sampleRate: buffer.sampleRate,
                    seconds: Math.round(buffer.duration),
                },
                levels,
                samples,
            };
        };

        const spatial = await decode(spatialUrl);
        const mono = await decode(monoUrl);

        // A browser that broadcasts one channel across eight reports eight
        // channels and sounds like nothing in particular. Count the channels
        // that are a copy of the first to tell that apart from real ambisonics.
        const first = spatial.samples[0] ?? [];
        const copiesOfFirstChannel = spatial.samples
            .slice(1)
            .filter((channel) => channel.every((value, index) => value === first[index]))
            .length;

        return {
            spatial: { ...spatial.summary, levels: spatial.levels },
            mono: { ...mono.summary, levels: mono.levels },
            copiesOfFirstChannel,
        };
    });

    expect(decoded.spatial.channels).toBe(8);
    expect(decoded.mono.channels).toBe(1);
    expect(decoded.spatial.seconds).toBeGreaterThan(0);

    // Eight channels of silence would satisfy everything above. These say the
    // file decoded to sound: the W channel carries the bed, enough of the rest
    // carry the field, and none of them is a copy of W — which is what a
    // browser that broadcast one channel across eight would produce, an
    // eight-channel buffer with no space in it.
    const levels = decoded.spatial.levels;
    console.log(
        `${family} 8ch levels: ${levels.map((l) => l.rms.toFixed(5)).join(" ")}` +
        ` | mono ${decoded.mono.levels[0].rms.toFixed(5)}` +
        ` | copies of ch0: ${decoded.copiesOfFirstChannel}`
    );

    const SILENT = 1e-5;
    expect(levels[0].rms, "channel 0 (W) decoded to silence").toBeGreaterThan(SILENT);
    expect(
        levels.filter((level) => level.rms > SILENT).length,
        "too few channels carry signal for this to be a spatial field"
    ).toBeGreaterThanOrEqual(4);
    expect(
        decoded.copiesOfFirstChannel,
        "channels are copies of each other, so the field is a broadcast mono"
    ).toBe(0);
    expect(decoded.mono.levels[0].rms, "the mono bed decoded to silence").toBeGreaterThan(SILENT);
});

test("ships a manifest the device can install from", async () => {
    await page.goto("/");

    // Read the link and fetch it in one no-argument evaluate: nothing has to
    // cross the argument boundary, and the fetch happens inside the page, the
    // way the device fetches it when someone installs. page.request would run
    // it from node, out through BrowserStack's Android proxy, whose own
    // certificate reads as "self signed certificate in certificate chain" —
    // a fact about the tunnel, never about the manifest.
    const manifest = await page.evaluate(async (): Promise<{ display?: string }> => {
        const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (!link) throw new Error("no manifest is linked, so nothing can be installed");
        const response = await fetch(link.href);
        if (!response.ok) throw new Error(`Failed to fetch the manifest (${response.status})`);
        return await response.json();
    });

    expect(manifest.display).toBe("standalone");
});
