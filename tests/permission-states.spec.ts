/**
 * Every state the permission UI can be in, asserted and photographed.
 *
 * The preflight, the recovery steps and the downmix note each appear only when
 * something has gone wrong, which means nothing in the normal test run ever
 * renders them. This walks each failure deliberately.
 *
 * What this cannot prove: what a real iPhone does. Playwright's WebKit has no
 * DeviceOrientationEvent.requestPermission at all, so the iOS prompt is stubbed
 * here rather than exercised. These tests show that the app responds correctly
 * to each answer; whether iOS 26 still asks the question needs hardware.
 *
 * Screenshots land in test-results/permission-states/ for the review page.
 */
import { expect, test, type Page } from "@playwright/test";

const SHOT_DIR = "test-results/permission-states";

/**
 * The copy is phone-specific, so the chromium project's desktop UA would
 * exercise the generic fallback wording instead of what a walker reads.
 */
const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test.use({
    userAgent: IPHONE_UA,
    // A real iPhone 13's logical size, so the screenshots show what fits on
    // the glass rather than an artificially tall window.
    viewport: { width: 390, height: 844 },
});

/** Hartford Beach State Park center, matching approach-ring.spec.ts. */
const AT_PARK = { latitude: 44.01320393, longitude: -97.11059202 };

const shot = (page: Page, name: string) =>
    page.screenshot({ path: `${SHOT_DIR}/${name}.png` });

/**
 * Photograph one element instead of the viewport. The welcome panel scrolls
 * inside its own container, so a viewport shot of it is always a crop.
 */
const shotOf = (page: Page, selector: string, name: string) =>
    page.locator(selector).first().screenshot({ path: `${SHOT_DIR}/${name}.png` });

const WELCOME_PANEL = "[role=dialog] .rounded-2xl";

/** Feed a steady fix at the park so audio loads and the strip appears. */
async function stubFixesAtPark(page: Page) {
    await page.addInitScript((position) => {
        let watchId = 0;
        const callbacks = new Map<number, (fix: unknown) => void>();
        let step = 0;

        const emit = () => {
            step += 1;
            for (const callback of callbacks.values()) {
                callback({
                    coords: {
                        // Drift under a metre: the app interpolates over a
                        // history and a frozen position never renders.
                        latitude: position.latitude + step * 0.0000005,
                        longitude: position.longitude,
                        accuracy: 5,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null,
                    },
                    timestamp: Date.now(),
                });
            }
        };

        window.setInterval(emit, 250);
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: {
                watchPosition: (callback: (fix: unknown) => void) => {
                    watchId += 1;
                    callbacks.set(watchId, callback);
                    return watchId;
                },
                clearWatch: (id: number) => callbacks.delete(id),
                getCurrentPosition: emit,
            },
        });
    }, AT_PARK);
}

/** The walker taps "Don't Allow" on the browser's own location prompt. */
async function stubDeniedGeolocation(page: Page) {
    await page.addInitScript(() => {
        const fail = (_ok: unknown, onError?: (error: unknown) => void) => {
            setTimeout(() => onError?.({ code: 1, message: "User denied Geolocation" }), 100);
        };
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: {
                watchPosition: (ok: unknown, onError?: (error: unknown) => void) => {
                    fail(ok, onError);
                    return 1;
                },
                clearWatch: () => {},
                getCurrentPosition: fail,
            },
        });
    });
}

/** Location was already refused before this visit, as the Permissions API sees it. */
async function stubPermissionState(page: Page, state: string) {
    await page.addInitScript((permissionState) => {
        Object.defineProperty(navigator, "permissions", {
            configurable: true,
            value: { query: async () => ({ state: permissionState, onchange: null }) },
        });
    }, state);
}

/** Remove a capability the way a browser that lacks it would. */
async function removeCapability(page: Page, what: "geolocation" | "orientation" | "audio") {
    await page.addInitScript((target) => {
        if (target === "geolocation") {
            Object.defineProperty(Navigator.prototype, "geolocation", {
                configurable: true,
                get: () => undefined,
            });
        }
        if (target === "orientation") {
            Object.defineProperty(window, "DeviceOrientationEvent", {
                configurable: true,
                get: () => undefined,
            });
        }
        if (target === "audio") {
            Object.defineProperty(window, "AudioContext", {
                configurable: true,
                get: () => undefined,
            });
            Object.defineProperty(window, "webkitAudioContext", {
                configurable: true,
                get: () => undefined,
            });
        }
    }, what);
}

/** An iOS-style permission gate that answers however the test wants. */
async function stubOrientationPermission(page: Page, answer: "granted" | "denied") {
    await page.addInitScript((reply) => {
        window.localStorage.removeItem("deviceOrientationPermission");
        (window.DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<string>;
        }).requestPermission = async () => reply;
    }, answer);
}

/**
 * Answer every decode with a buffer of the given channel count, and stop the
 * CDN fetch that would otherwise pull 10-25 MB per park. Eight channels is a
 * healthy spatial file; two is a browser that downmixed it.
 */
async function stubAudioDecode(page: Page, { channels }: { channels: number }) {
    await page.addInitScript((channelCount) => {
        const proto = window.AudioContext.prototype;
        proto.decodeAudioData = function (this: AudioContext) {
            return Promise.resolve(
                this.createBuffer(channelCount, this.sampleRate * 2, this.sampleRate)
            );
        } as AudioContext["decodeAudioData"];

        const realFetch = window.fetch;
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : String((input as Request).url ?? input);
            if (url.includes("b-cdn.net")) {
                // Never parsed; the stub above answers instead.
                return Promise.resolve(new Response(new ArrayBuffer(1024), { status: 200 }));
            }
            return realFetch(input, init);
        };
    }, channels);
}

/**
 * Make the first Start fail the way an iPhone that refuses the autoplay gate
 * does: the context stays suspended and resume() rejects. The message is the
 * kind of string that used to be printed straight onto the welcome screen.
 */
const UNLOCK_EXCEPTION = "NotAllowedError: The request is not allowed by the user agent";

async function stubFailingUnlock(page: Page) {
    await page.addInitScript((message) => {
        Object.defineProperty(window.BaseAudioContext.prototype, "state", {
            configurable: true,
            get: () => "suspended",
        });
        window.AudioContext.prototype.resume = () => Promise.reject(new Error(message));
    }, UNLOCK_EXCEPTION);
}

/** Replace the clipboard with one that always answers the same way. */
async function stubClipboard(page: Page, outcome: "works" | "refuses") {
    await page.addInitScript((mode) => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: async () => {
                    if (mode === "refuses") throw new Error("NotAllowedError: Write permission denied.");
                },
            },
        });
    }, outcome);
}

const startWalk = async (page: Page) => {
    await page.getByRole("button", { name: /start/i }).click();
};

const preflight = (page: Page) => page.getByTestId("capability-preflight");
/**
 * The panel's heading. Asserted by exact text rather than substring, because
 * "Part of the walk will not work here" contains the blocked heading and a
 * loose match would let the wrong one pass.
 */
const preflightHeading = (page: Page) => preflight(page).locator("p").first();
const locationStatus = (page: Page) => page.getByTestId("location-status");

test.describe("before the walk: the welcome preflight", () => {
    test("says nothing when the browser can do everything", async ({ page }) => {
        await stubFixesAtPark(page);
        await page.goto("/");

        await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toBeVisible();
        await expect(preflight(page)).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^\s*start\s*$/i })).toBeVisible();
        await shotOf(page, WELCOME_PANEL, "01-preflight-all-good");
    });

    test("warns, without blocking, when the device cannot report facing", async ({ page }) => {
        await removeCapability(page, "orientation");
        await stubFixesAtPark(page);
        await page.goto("/");

        await expect(preflightHeading(page)).toHaveText("Part of the walk will not work here");
        await expect(preflight(page)).toContainText(/turning will not rotate the sound/i);
        // Still startable: losing rotation costs one feature, not the walk.
        await expect(page.getByRole("button", { name: /^\s*start\s*$/i })).toBeVisible();
        await shotOf(page, WELCOME_PANEL, "02-preflight-no-orientation");
    });

    test("blocks and offers to start anyway when location is missing entirely", async ({ page }) => {
        await removeCapability(page, "geolocation");
        await page.goto("/");

        await expect(preflightHeading(page)).toHaveText("The walk will not work here");
        await expect(preflight(page)).toContainText(/cannot share your location/i);
        await expect(page.getByRole("button", { name: /start anyway/i })).toBeVisible();
        await shotOf(page, WELCOME_PANEL, "03-preflight-no-geolocation");
    });

    test("blocks when the browser has no Web Audio", async ({ page }) => {
        await stubFixesAtPark(page);
        await removeCapability(page, "audio");
        await page.goto("/");

        await expect(preflightHeading(page)).toHaveText("The walk will not work here");
        await expect(preflight(page)).toContainText(/cannot play sound at all/i);
        // One fault, not two: the decode line must stay quiet when there is
        // no AudioContext for it to hang off.
        await expect(preflight(page)).not.toContainText(/cannot play the park recordings/i);
        await shotOf(page, WELCOME_PANEL, "04-preflight-no-audio");
    });

});

/**
 * A link shared in a message opens in that app's own browser far more often
 * than it opens in Safari, and an in-app browser is the one place the two
 * things the walk needs, sound from a tap and the motion prompt, quietly fail.
 * Nothing can send the walker to Safari from inside here, so what is asserted
 * is that they are told, and given the link to carry across themselves.
 */
test.describe("before the walk: opened inside another app", () => {
    test.use({
        userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.37.90 (iPhone14,2; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 588527267)",
    });

    test("tells the walker to open the link in their own browser", async ({ page }) => {
        await stubFixesAtPark(page);
        await page.goto("/");

        await expect(preflightHeading(page)).toHaveText("Open this in your phone's browser");
        await expect(preflight(page)).toContainText(/opened inside another app/i);
        // A guess from the user agent, so it never takes the walk away.
        await expect(page.getByRole("button", { name: /^\s*start\s*$/i })).toBeVisible();

        const escape = page.getByTestId("open-in-browser");
        await expect(escape).toBeVisible();
        // The iPhone taps, not the Android ones: the user agent above is iOS.
        await expect(escape).toContainText(/Open in Safari/);
        await expect(escape.getByRole("button", { name: /copy the link/i })).toBeVisible();
        await shotOf(page, WELCOME_PANEL, "11-preflight-in-app-browser");
    });

    test("hands over the link when the copy succeeds", async ({ page }) => {
        await stubClipboard(page, "works");
        await stubFixesAtPark(page);
        await page.goto("/");

        await page.getByRole("button", { name: /copy the link/i }).click();
        await expect(page.getByTestId("copy-link-status")).toContainText(/Paste it into Safari/i);
        await shotOf(page, WELCOME_PANEL, "12-in-app-browser-link-copied");
    });

    test("says so when the app will not even allow a copy", async ({ page }) => {
        // Several in-app browsers refuse clipboard writes outright. Leaving the
        // button silent would look like the tap did nothing.
        await stubClipboard(page, "refuses");
        await stubFixesAtPark(page);
        await page.goto("/");

        await page.getByRole("button", { name: /copy the link/i }).click();
        await expect(page.getByTestId("copy-link-status")).toContainText(/would not let the link be copied/i);
        await shotOf(page, WELCOME_PANEL, "13-in-app-browser-copy-refused");
    });
});

test.describe("before the walk: Start could not turn the sound on", () => {
    test("says what to do instead of printing the exception", async ({ page }) => {
        await stubFailingUnlock(page);
        await stubFixesAtPark(page);
        await page.goto("/");
        await startWalk(page);

        const failure = page.getByTestId("unlock-error");
        await expect(failure).toBeVisible();
        // The sentence the walker reads: something to do, from where they are.
        const sentence = failure.locator("p").first();
        await expect(sentence).toContainText(/check your phone is not on silent/i);
        await expect(sentence).not.toContainText(UNLOCK_EXCEPTION);
        await expect(sentence).not.toContainText(/NotAllowedError/);

        // The exception is not lost, it is moved: this runs against the dev
        // server, where the debug surfaces are on. production-surfaces.spec.ts
        // proves it is gone from a shipped build.
        await expect(page.getByTestId("unlock-error-detail")).toContainText(UNLOCK_EXCEPTION);

        // Still on the welcome screen, with a button to press again.
        await expect(page.getByRole("button", { name: /^\s*start\s*$/i })).toBeVisible();
        await shotOf(page, WELCOME_PANEL, "14-unlock-failed");
    });

    test("cannot be dismissed by tapping beside it or pressing escape", async ({ page }) => {
        // The message only helps if the walker is still on the screen to read
        // it. Both of these used to close the welcome screen and hand them a
        // map with the sound still locked and nothing saying why.
        await stubFailingUnlock(page);
        await stubFixesAtPark(page);
        await page.goto("/");
        await startWalk(page);
        await expect(page.getByTestId("unlock-error")).toBeVisible();

        // Well outside the panel, which is centred.
        await page.mouse.click(10, 10);
        await expect(page.getByTestId("unlock-error")).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(page.getByTestId("unlock-error")).toBeVisible();
        await expect(page.getByRole("button", { name: /^\s*start\s*$/i })).toBeVisible();
    });

    test("offers a deliberate way through to the map", async ({ page }) => {
        // A phone that will not unlock here sometimes unlocks from the park's
        // own start button, so the walk must not end on the doorstep.
        await stubFailingUnlock(page);
        await stubFixesAtPark(page);
        await page.goto("/");
        await startWalk(page);

        await page.getByTestId("skip-unlock").click();

        await expect(page.getByTestId("unlock-error")).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Resonant Landscapes" })).toHaveCount(0);
    });

    test("shows no way out before Start has been tried", async ({ page }) => {
        // It is an answer to a failure, not a second button competing with
        // Start on a screen where nothing has gone wrong yet.
        await stubFixesAtPark(page);
        await page.goto("/");

        await expect(page.getByTestId("skip-unlock")).toHaveCount(0);
    });
});

test.describe("before the walk: opened on a laptop", () => {
    test.use({
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });

    test("says it is a phone piece rather than calling the browser broken", async ({ page }) => {
        await stubFixesAtPark(page);
        await page.goto("/");

        await expect(preflightHeading(page)).toHaveText("This walk needs a phone");
        // Never blocked: the mocked desk replays run here on purpose.
        await expect(page.getByRole("button", { name: /^\s*start\s*$/i })).toBeVisible();
        await shotOf(page, WELCOME_PANEL, "05-preflight-desktop");
    });
});

test.describe("during the walk: location refused", () => {
    test("explains a location denial that happened before this visit", async ({ page }) => {
        await stubPermissionState(page, "denied");
        await stubDeniedGeolocation(page);
        await page.goto("/");
        await startWalk(page);

        await expect(locationStatus(page)).toContainText(/location is blocked/i);
        await expect(locationStatus(page)).toContainText(/nothing will play until you turn it on/i);
        await shot(page, "06-location-denied-beforehand");
    });

    test("explains a denial the walker just tapped, with numbered steps", async ({ page }) => {
        await stubDeniedGeolocation(page);
        await page.goto("/");
        await startWalk(page);

        const status = locationStatus(page);
        await expect(status).toContainText(/location is blocked/i);
        // The point of the whole panel: somewhere to go, not just a diagnosis.
        await expect(status.locator("ol li")).toHaveCount(3);
        await expect(status).toContainText(/Website Settings/);
        await expect(status).toContainText(/reload the page/i);
        await shot(page, "07-location-denied-in-app");
    });
});

test.describe("during the walk: rotation refused", () => {
    test("shows recovery steps when the device refuses orientation", async ({ page }) => {
        await stubAudioDecode(page, { channels: 8 });
        await stubFixesAtPark(page);
        await stubOrientationPermission(page, "denied");
        await page.goto("/");
        await startWalk(page);

        const enable = page.getByRole("button", { name: /enable rotation/i });
        await expect(enable).toBeVisible({ timeout: 30_000 });
        await enable.click();

        const recovery = page.getByTestId("permission-recovery-orientation");
        await expect(recovery).toBeVisible();
        await expect(recovery).toContainText(/rotation is blocked/i);
        // Honest about the stakes: the walk is not over.
        await expect(recovery).toContainText(/everything else still works/i);
        await expect(recovery.locator("ol li")).toHaveCount(3);
        // The button steps aside while the panel is up. Leaving it would offer
        // a retry that iOS answers "denied" without ever prompting again.
        await expect(enable).toHaveCount(0);
        await shot(page, "08-rotation-denied");
    });

    test("lets the walker dismiss the steps and keep walking", async ({ page }) => {
        await stubAudioDecode(page, { channels: 8 });
        await stubFixesAtPark(page);
        await stubOrientationPermission(page, "denied");
        await page.goto("/");
        await startWalk(page);

        const enable = page.getByRole("button", { name: /enable rotation/i });
        await expect(enable).toBeVisible({ timeout: 30_000 });
        await enable.click();
        await page.getByRole("button", { name: /continue without it/i }).click();

        await expect(page.getByTestId("permission-recovery-orientation")).toHaveCount(0);
        await expect(enable).toBeVisible();
        await shot(page, "09-rotation-dismissed");
    });

    test("does not accuse the device before the walker has asked", async ({ page }) => {
        await stubAudioDecode(page, { channels: 8 });
        await stubFixesAtPark(page);
        await stubOrientationPermission(page, "denied");
        await page.goto("/");
        await startWalk(page);

        // The panel is a response to a tap, not a greeting.
        await expect(page.getByTestId("permission-recovery-orientation")).toHaveCount(0);
    });
});

test.describe("during the walk: audio that decoded wrong", () => {
    test("admits when the browser flattened the surround recording", async ({ page }) => {
        await stubAudioDecode(page, { channels: 2 });
        await stubFixesAtPark(page);
        await page.goto("/");
        await startWalk(page);

        const note = page.getByTestId("spatial-degraded-note");
        await expect(note).toBeVisible({ timeout: 30_000 });
        await expect(note).toContainText(/plain mix/i);
        await shot(page, "10-spatial-downmixed");
    });
});
