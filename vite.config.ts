import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      /*
       * autoUpdate, deliberately, and with skipWaiting.
       *
       * The alternative is prompting the walker to reload, which is a dialog
       * about caching in the middle of a sound walk. Worse, the default
       * lifecycle leaves a new build waiting until every tab closes, and a
       * phone that never closes the tab would hold yesterday's bundle for
       * days. The mobile suites drive deploy previews through this same
       * machinery, so a stale bundle would not fail a test; it would quietly
       * test the wrong build.
       *
       * The cost is that a walker who reloads mid-walk gets the new build.
       * That is the right way round: shipping a fix nobody receives is the
       * worse failure for a piece still being walked and corrected.
       */
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/*.png"],
      workbox: {
        /*
         * The shell only. Audio and map tiles are rl-1u7.8.2, and caching
         * those needs a policy for eviction and for what "cached" means to a
         * walker, which is a different question from whether the app opens.
         *
         * Explicit rather than a catch-all, so nothing new under public/
         * joins the precache by accident as it grows.
         */
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: "Resonant Landscapes",
        short_name: "Resonant",
        description:
          "A sound walk. Recordings of South Dakota state parks, placed on the ground where you walk.",
        theme_color: "#8ecdc0",
        background_color: "#F6F1E7",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
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
