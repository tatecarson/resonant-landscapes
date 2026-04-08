import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:4173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
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
        url: `${localBaseURL}/resonant-landscapes/`,
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
