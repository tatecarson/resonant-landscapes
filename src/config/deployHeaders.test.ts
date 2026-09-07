import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The caching contract in netlify.toml, which nothing else can check.
 *
 * These rules are only applied by Netlify, so no Playwright run against a
 * dev server or a local preview exercises them: the first place they take
 * effect is production. That makes them exactly the kind of configuration
 * that rots silently, and the consequences are not subtle. A cached service
 * worker pins every visitor to an old build. A cached index.html points at
 * fingerprinted assets that no longer exist, which is a blank page rather
 * than a stale one.
 */
const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");

function cacheControlFor(path: string): string | null {
    // Small and deliberate rather than a TOML parser: one dependency for four
    // assertions is a worse trade than a regex with a test around it.
    const section = new RegExp(
        String.raw`\[\[headers\]\]\s*\n\s*for\s*=\s*"${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\s*\n\s*\[headers\.values\]\s*\n\s*Cache-Control\s*=\s*"([^"]+)"`
    );
    return toml.match(section)?.[1] ?? null;
}

describe("netlify caching rules", () => {
    it("lets the fingerprinted assets be cached forever", () => {
        // A changed file is a changed URL, so this is safe and it is what
        // stops every visit revalidating over cellular before a walk starts.
        expect(cacheControlFor("/assets/*")).toMatch(/immutable/);
    });

    it("never caches the entry point", () => {
        expect(cacheControlFor("/index.html")).toMatch(/max-age=0/);
    });

    it("never caches the service worker", () => {
        // The worker decides which build everyone is running. Holding it for
        // a day is a deploy that reaches nobody for a day, and it fails
        // silently because the old build still works.
        const rule = cacheControlFor("/sw.js");
        expect(rule, "/sw.js has no explicit rule, so it inherits a default").not.toBeNull();
        expect(rule).toMatch(/max-age=0/);
    });

    it("never caches the manifest", () => {
        expect(cacheControlFor("/manifest.webmanifest")).toMatch(/max-age=0/);
    });

    it("counts on the real site and nowhere else", () => {
        // A Netlify build variable reaches every context by default, so the
        // dashboard value that turns counting on would turn it on for deploy
        // previews and branch builds as well — Tate walking through his own
        // work, filed as visitors. Neither of these can be checked anywhere
        // but production, which is what this file is for.
        for (const context of ["deploy-preview", "branch-deploy"]) {
            const section = new RegExp(
                String.raw`\[context\.${context}\.environment\]\s*\n\s*VITE_GOATCOUNTER_SITE\s*=\s*""`
            );
            expect(toml, `${context} builds would carry the site code`).toMatch(section);
        }
    });

    it("lets the counting script through the policy that would block it", () => {
        // The script is served from gc.zgo.at, which is not *.goatcounter.com
        // — the host the endpoint is on. Allowing only the latter blocks the
        // script outright, and the failure is a console error on a phone in a
        // field and a dashboard that stays at zero.
        const policy = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1] ?? "";
        const scriptSrc = policy.match(/script-src([^;]*)/)?.[1] ?? "";
        expect(scriptSrc, "count.js is served from gc.zgo.at").toContain("https://gc.zgo.at");
    });

    it("still falls back to the SPA entry point for every route", () => {
        // The walk has a /debug path route as well as hash routes, and the
        // service worker's navigateFallback only covers navigations it
        // controls. A first visit to a deep link is served by Netlify.
        expect(toml).toMatch(/from\s*=\s*"\/\*"[\s\S]*?to\s*=\s*"\/index\.html"[\s\S]*?status\s*=\s*200/);
    });
});
