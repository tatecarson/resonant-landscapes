import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The floor from the support matrix in README.md, encoded so the build
    // fails rather than shipping syntax an in-support phone cannot parse.
    // safari15 is the binding constraint: it is the oldest release with the
    // Web Audio and DeviceOrientation behaviour the walk depends on, and it
    // is stricter than either Android target. Keep this in step with the
    // `browserslist` key in package.json, which drives autoprefixer.
    target: ["safari15", "chrome109", "firefox115"],
  },
  server: {
    allowedHosts: true
  },
  test: {
    // Unit tests only. Playwright owns tests/*.spec.ts and must not be
    // collected here.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.mjs"],
    environment: "node"
  }
});
