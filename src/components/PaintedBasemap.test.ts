import { describe, expect, it } from "vitest";
import { palette } from "../theme/palette";
import { DEFAULT_PAINTED_TONE, ORIGINAL_COLOUR, PAINTED_TONES, TONE_CEILING } from "./PaintedBasemap";

/** Tokens at least as dark as the park markers' fill. */
const MARKER_DARK_TOKENS = new Set(["edge", "accentSoft", "inkMuted", "ink"]);

describe.each(Object.entries(PAINTED_TONES))("the %s painted ground", (_, tone) => {
    it("is made only of palette tokens", () => {
        for (const { token } of tone.ramp) {
            expect(palette).toHaveProperty(token);
        }
    });

    it("runs from 0 to 1 in order, so every lightness lands on it", () => {
        const stops = tone.ramp.map(({ at }) => at);
        expect(stops[0]).toBe(0);
        expect(stops[stops.length - 1]).toBe(1);
        expect([...stops].sort((a, b) => a - b)).toEqual(stops);
    });

    it("keeps the ground lighter than the tokens the park markers use", () => {
        const darkest = Math.max(
            ...tone.ramp.filter(({ token }) => MARKER_DARK_TOKENS.has(token)).map(({ at }) => at),
        );
        expect(tone.floor).toBeGreaterThan(darkest);
    });
});

describe("painted ground", () => {
    it("defaults to a tone that exists", () => {
        expect(PAINTED_TONES).toHaveProperty(DEFAULT_PAINTED_TONE);
    });

    it("leaves the photograph a minority of the colour", () => {
        expect(ORIGINAL_COLOUR).toBeGreaterThanOrEqual(0);
        expect(ORIGINAL_COLOUR).toBeLessThan(0.5);
        expect(TONE_CEILING).toBeGreaterThan(0);
        expect(TONE_CEILING).toBeLessThanOrEqual(1);
    });
});
