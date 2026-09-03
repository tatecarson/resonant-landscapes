import { defineConfig } from "@playwright/test";

/**
 * The BrowserStack real-device runner (rl-06c.6).
 *
 * Deliberately minimal, and deliberately separate from the dev config: the
 * platform — which device, which browser — comes from browserstack.yml, one
 * run per platform, and the SDK wraps `playwright test` with that launch.
 * One project here, so a multiplication by emulated projects can never
 * sneak into a real-device bill.
 *
 * No webServer: the suite drives a deployed URL, because real devices cannot
 * reach a laptop's localhost. The globalSetup server-identity check still
 * runs, so a mistyped URL fails loudly instead of testing somebody else's
 * site on seven devices — and with no webServer to fall back on, a URL that
 * refuses the connection fails there too rather than being waved through.
 */

/*
 * PLAYWRIGHT_BASE_URL is the only thing that decides which site the devices
 * open, so this reads it rather than defaulting. browserstack.yml declares
 * `playwrightConfigOptions.use.baseURL: ${PLAYWRIGHT_BASE_URL}` and the SDK
 * applies that over whatever this file sets: a default here would be dead
 * code that reads as a safety net, and an unset variable would resolve to an
 * empty baseURL on all seven devices. Both entry points supply it — the
 * workflow, and `npm run browserstack:real-devices`, which defaults it to
 * production. Anything else fails here, before a session is billed.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
if (!baseURL) {
    throw new Error(
        [
            "PLAYWRIGHT_BASE_URL is not set, and browserstack.yml overrides",
            "use.baseURL with it, so the devices would open an empty URL.",
            "Run `npm run browserstack:real-devices`, which defaults it to",
            "production, or set it to the deploy preview you mean to walk.",
        ].join("\n")
    );
}

export default defineConfig({
    testDir: "./tests",
    testMatch: /real-device\.spec\.ts$/,
    globalSetup: "./tests/global-setup.ts",
    timeout: 120_000,
    expect: {
        timeout: 15_000,
    },
    // browserstack.yml declares parallelsPerPlatform: 1, and each Playwright
    // worker opens its own remote session. Left to its default (half the
    // cores), a multi-core runner would quietly open two sessions per
    // platform — double the real-device minutes this build budgets for.
    workers: 1,
    use: {
        baseURL,
    },
    projects: [
        {
            // The SDK rewrites the launch per platform in browserstack.yml;
            // the engine named here is only what the local dry-run uses.
            name: "browserstack",
            use: { browserName: "chromium" },
        },
    ],
});
