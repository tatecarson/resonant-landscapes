import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The floor from the support matrix in README.md. safari15/ios15 are the
    // binding constraint; Rolldown treats the two as separate engines, so
    // naming only one leaves the other unconstrained. Keep this in step with
    // the `browserslist` key in package.json, which drives autoprefixer.
    //
    // What this buys, precisely: the bundle PARSES on the floor. Newer syntax
    // is downleveled (a class static block comes out as plain assignments),
    // and anything that cannot be downleveled is deferred to a runtime call
    // rather than rejected — a /v-flag regex literal becomes RegExp(src, "v"),
    // which parses everywhere and throws only when that line runs. So the
    // build does not fail on an unsupported feature and never has. Treat this
    // as a guard against syntax errors, not a guarantee of support; the
    // tsconfig lib floor covers standard-library calls, and DOM APIs are still
    // on us to feature-detect.
    target: ["safari15", "ios15", "chrome109", "firefox115"],
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
