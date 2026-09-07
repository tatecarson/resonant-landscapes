import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { palette, rgbChannels, withAlpha, cssVariableName } from "./palette";

const read = (path: string) => readFileSync(join(__dirname, "..", "..", path), "utf8");

/**
 * The palette has one definition and three exits, and two of those exits are
 * copies: the `--rl-*` block in src/index.css, which plain CSS reads, and the
 * literals in the marker SVGs, which are fetched as separate documents and so
 * cannot reference anything at all. Copies drift. These tests are what stops
 * them, and they are the reason the copies are allowed to exist.
 */
describe("palette", () => {
    it("mirrors every token onto :root in both spellings", () => {
        const css = read("src/index.css");

        for (const [token, value] of Object.entries(palette)) {
            const name = cssVariableName(token);
            expect(css, `${name} is missing or has drifted from palette.js`)
                .toContain(`${name}: ${value};`);
            expect(css, `${name}-rgb is missing or has drifted from palette.js`)
                .toContain(`${name}-rgb: ${rgbChannels(value)};`);
        }
    });

    it("leaves no colour literal in the stylesheets", () => {
        for (const file of ["src/index.css", "src/App.css", "src/components/layers.css"]) {
            const css = read(file)
                // the mirrored :root block is the one place values are written out
                .replace(/:root\s*\{[^}]*\}/, "");

            expect(css.match(/#[0-9a-fA-F]{3,8}\b/g), `raw hex in ${file}`).toBeNull();
            expect(css.match(/rgba?\((?!var)[^)]*\)/g), `raw rgb/rgba in ${file}`).toBeNull();
        }
    });

    it("keeps the marker SVGs on the same values", () => {
        // Every colour these may use, because they cannot reference a token.
        const allowed = new Set([
            palette.ink,        // the drop shadow under every marker
            palette.ground,     // the cream body of the walker's marker, and the heard dot
            palette.edge,       // the walker's heading arrow and ring
            palette.accentSoft, // the park dot
            palette.beacon,     // the walker's own centre
        ]);

        const dir = join(__dirname, "..", "assets");
        const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const svg = readFileSync(join(dir, file), "utf8");
            for (const hex of svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
                expect(allowed, `${file} uses ${hex}, which is not a palette value`)
                    .toContain(hex);
            }
        }
    });

    /**
     * The comments in those SVGs are load-bearing prose, and prose is where
     * this went wrong: a comment explaining why the markers cannot say
     * `var(--rl-ink)` contained the two hyphens, which is illegal inside an
     * XML comment. All three markers failed to decode — the walker's own
     * position, the park dots and the heard dots were broken images in every
     * build, and nothing noticed, because an SVG that does not parse is silent
     * rather than loud.
     */
    it("keeps the marker SVGs parseable as XML", () => {
        const dir = join(__dirname, "..", "assets");
        const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));

        for (const file of files) {
            const svg = readFileSync(join(dir, file), "utf8");
            for (const comment of svg.match(/<!--[\s\S]*?-->/g) ?? []) {
                expect(
                    comment.slice(4, -3),
                    `${file} has a double hyphen inside a comment, which no XML parser accepts`
                ).not.toContain("--");
            }
        }
    });

    it("builds a canvas colour from a token and an alpha", () => {
        expect(withAlpha(palette.ink, 0.25)).toBe("rgba(11, 26, 22, 0.25)");
        expect(rgbChannels(palette.panel)).toBe("142 205 192");
        expect(cssVariableName("statusErrorSurface")).toBe("--rl-status-error-surface");
    });
});
