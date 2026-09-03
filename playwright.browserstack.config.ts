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
 * No webServer: the suite drives a deployed URL (production by default, a
 * deploy preview via PLAYWRIGHT_BASE_URL), because real devices cannot
 * reach a laptop's localhost. The globalSetup server-identity check still
 * runs, so a mistyped URL fails loudly instead of testing somebody else's
 * site on seven devices.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://resonant-landscapes.netlify.app";

export default defineConfig({
    testDir: "./tests",
    testMatch: /real-device\.spec\.ts$/,
    globalSetup: "./tests/global-setup.ts",
    timeout: 120_000,
    expect: {
        timeout: 15_000,
    },
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
