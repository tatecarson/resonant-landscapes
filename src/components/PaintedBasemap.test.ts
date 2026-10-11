import { describe, expect, it } from "vitest";
import { palette } from "../theme/palette";
import { ORIGINAL_COLOUR, TONE_CEILING, TONE_FLOOR, TONE_RAMP } from "./PaintedBasemap";

describe("the painted ground's tone ramp", () => {
    it("is made only of palette tokens", () => {
        for (const { token } of TONE_RAMP) {
            expect(palette).toHaveProperty(token);
        }
    });

    it("runs from 0 to 1 in order, so every lightness lands on it", () => {
        const stops = TONE_RAMP.map(({ at }) => at);
        expect(stops[0]).toBe(0);
        expect(stops[stops.length - 1]).toBe(1);
        expect([...stops].sort((a, b) => a - b)).toEqual(stops);
    });

    it("keeps the ground lighter than the tokens the park markers use", () => {
        const markerStop = Math.max(
            ...TONE_RAMP.filter(({ token }) => token === "edge" || token === "accentSoft").map(({ at }) => at),
        );
        expect(TONE_FLOOR).toBeGreaterThan(markerStop);
    });

    it("leaves the photograph a minority of the colour", () => {
        expect(ORIGINAL_COLOUR).toBeGreaterThanOrEqual(0);
        expect(ORIGINAL_COLOUR).toBeLessThan(0.5);
        expect(TONE_CEILING).toBeGreaterThan(0);
        expect(TONE_CEILING).toBeLessThanOrEqual(1);
    });
});
