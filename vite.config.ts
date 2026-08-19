import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
