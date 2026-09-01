import { defineConfig, devices } from "@playwright/test";

/**
 * The production build, which the main config never exercises.
 *
 * Everything else runs against `npm run dev`, where import.meta.env.DEV is
 * true — so the gates around the debug mirrors, the /debug route and the
 * ?mock= spoof are invisible to it. Removing those gates would break nothing
 * anyone runs. This config builds, previews, and checks the shipped bundle.
 */
const PORT = 4188;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  /*
   * offline-shell joins production-surfaces here because the service worker
   * only exists in a built bundle: vite-plugin-pwa leaves it out of dev, so
   * a spec about offline behaviour run against `npm run dev` would assert
   * nothing and pass.
   */
  testMatch: /(production-surfaces|offline-shell)\.spec\.ts$/,
  globalSetup: "./tests/global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --host 127.0.0.1`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
