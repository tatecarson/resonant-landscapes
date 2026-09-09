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
        /*
         * No start_url, deliberately, so an install captures the walk that is
         * on screen.
         *
         * It used to be "/", which is the DSU walk, and that made the
         * installed app unable to reach the other two sites at all: a walker
         * who added Terrace to their home screen opened South Dakota every
         * time, on a placement 59 km from where they were standing. That is
         * the same silent failure as rl-c8f — a walk on the wrong placement
         * looks exactly like a walk with nothing near it — with no URL to
         * correct it, because the installed app has no address bar.
         *
         * Absence is the fix rather than an oversight. The manifest spec
         * processes a missing start_url by setting it to the document URL, so
         * the route being walked at the moment of install is the route the
         * icon opens. iOS reaches the same place from the other direction: it
         * uses the current page URL for a home-screen add unless a manifest
         * start_url overrides it, which is precisely what this member was
         * doing.
         *
         * scope stays "/" and stays explicit. It would otherwise default to
         * the start_url's directory, which now varies per install, and the
         * three walks are one app that must not fall out of scope.
         *
         * One consequence to know about: id defaults to start_url too, so the
         * three routes install as three separate icons. That is the intent —
         * three walks, three apps — but they currently share a name, so they
         * are told apart only by their position on the home screen (rl-l8m).
         *
         * Spelled `undefined` rather than deleted, and the difference is not
         * stylistic: vite-plugin-pwa merges this object over defaults of its
         * own that include start_url "/", so simply removing the line puts
         * the DSU walk back in the built manifest. An explicit undefined
         * overrides the default and JSON.stringify then drops the key, which
         * production-surfaces.spec.ts asserts against the real build.
         */
        start_url: undefined,
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
    // A phone needs a secure context for orientation and audio, so testing
    // uncommitted work means a cloudflared quick tunnel to this server, and
    // those come with a fresh random hostname every time — which is why this
    // was a blanket `true`. The leading dot is Vite's "this domain and its
    // subdomains", so every tunnel the README's workflow can produce is
    // allowed and nothing else is. localhost and bare IPs are permitted by
    // Vite regardless, so `--host 0.0.0.0` for a phone on the same wifi is
    // unaffected. Add a domain here rather than reaching for `true` again.
    allowedHosts: [".trycloudflare.com"]
  },
  test: {
    // Unit tests only. Playwright owns tests/*.spec.ts and must not be
    // collected here.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.mjs"],
    environment: "node"
  }
});
