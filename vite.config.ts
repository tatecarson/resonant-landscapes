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
         * The shell, precached; the ground the walker covers, cached on use.
         *
         * Audio is deliberately absent from runtimeCaching. Its caching has
         * a policy of its own — network first, written through on use, a
         * measured byte budget, and "held" meaning a whole recording pair —
         * and that lives with the fetch seam in
         * src/audio/offlineAudioCache.ts (rl-1u7.8.2). A workbox route here
         * would be a second cache answering the same fetches, and the
         * walker-facing claim ("this park will play with no signal") has to
         * have exactly one source of truth.
         */
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            /*
             * Map tiles: a walker who loses signal keeps the ground they have
             * already looked at instead of watching the map go grey around
             * them. Served from cache first either way — the network copy is
             * fetched behind the answer, so an offline walk is never waiting.
             *
             * Stale-while-revalidate rather than cache-first, because the
             * layer requests tiles no-cors (RLayerTile sets no crossOrigin),
             * and an opaque response cannot be told apart from a successful
             * one: status is 0 whether Stadia sent the tile, a 404, or a rate
             * limit. Under cache-first a single bad tile would be pinned for
             * its whole 30-day lease, leaving one square of the map broken
             * long after the signal came back. Revalidating repairs it on the
             * walker's next look, which is the soonest it could matter.
             *
             * The cap is a session measured out: a walk covers a couple of
             * square kilometres across the app's zoom floor (~17) to its
             * ceiling (~19), which is on the order of a thousand tiles, at
             * tens of kilobytes each. The entry cap is well under that on
             * purpose. Browsers pad opaque responses in quota accounting —
             * megabytes apiece, against a real size in the tens of kilobytes
             * — so a cap sized to the real bytes would let the tiles crowd
             * the origin quota and quietly starve the audio cache, whose
             * write failures degrade in silence. 400 tiles is still most of a
             * walk's ground, and purgeOnQuotaError is the release valve.
             */
            urlPattern: /^https:\/\/tiles\.stadiamaps\.com\/tiles\/.*/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "resonant-tiles-v1",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /*
             * The typeface stylesheet. Stale-while-revalidate rather than
             * cache-first: it is a pointer to font files, cheap to refresh,
             * and a pointing hand that goes stale misdirects for longer than
             * it saves.
             */
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "resonant-font-css-v1",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /*
             * The font files themselves. Immutable by design — Google ships
             * them under hashed URLs — so cache-first with a long lease, and
             * an offline open of the shell keeps the walk's type rather than
             * falling back to whatever the phone defaults to.
             */
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "resonant-fonts-v1",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 365 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
