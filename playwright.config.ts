import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:4173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  // Playwright owns *.spec.ts only. Its default pattern also matches
  // *.test.mjs, which would pull the Vitest unit tests into this runner.
  // Importing from "vitest" loads @vitest/expect transitively, which throws
  // "Cannot redefine property: Symbol($$jest-matchers-object)" against the
  // matchers Playwright has already installed — taking down collection for
  // every spec, not just that file.
  testMatch: /.*\.spec\.ts$/,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: `${localBaseURL}/`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "iphone-13",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
