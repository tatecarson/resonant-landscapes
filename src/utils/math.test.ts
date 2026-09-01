import { describe, expect, it } from "vitest";
import { mapRange } from "./math";

/**
 * mapRange drives the proximity ring's pulse speed and alpha and the sun
 * rays' cycle time, always over a *descending* input range (PREFETCH_DISTANCE_METERS
 * down to 5 m) — closer means faster. Its clamping is what keeps those layers
 * inside their intended visual bounds when the walker is outside the ring or
 * standing on the marker.
 */
describe("mapRange", () => {
    it("maps the input range onto the output range", () => {
        expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    });

    it("returns outMin at the bottom and outMax at the top", () => {
        expect(mapRange(0, 0, 10, 2, 4)).toBe(2);
        expect(mapRange(10, 0, 10, 2, 4)).toBe(4);
    });

    it("clamps below the input range", () => {
        expect(mapRange(-50, 0, 10, 2, 4)).toBe(2);
    });

    it("clamps above the input range", () => {
        expect(mapRange(1000, 0, 10, 2, 4)).toBe(4);
    });

    it("handles a descending input range, as every caller uses", () => {
        // ProximityRingLayer: mapRange(distance, PREFETCH_DISTANCE_METERS, 5, 0.18, 1.4)
        expect(mapRange(40, 40, 5, 0.18, 1.4)).toBeCloseTo(0.18, 10);
        expect(mapRange(5, 40, 5, 0.18, 1.4)).toBeCloseTo(1.4, 10);
        expect(mapRange(22.5, 40, 5, 0.18, 1.4)).toBeCloseTo(0.79, 10);
    });

    it("clamps a walker standing on the marker to the fastest end", () => {
        // Distance can reach 0, below the 5 m inner bound.
        expect(mapRange(0, 40, 5, 0.18, 1.4)).toBeCloseTo(1.4, 10);
    });

    it("returns outMin for a degenerate input range instead of NaN", () => {
        // No caller passes inMin === inMax today, but NaN here would silently
        // blank a canvas layer rather than fail loudly.
        expect(mapRange(5, 10, 10, 0.2, 0.9)).toBe(0.2);
    });

    it("supports a descending output range", () => {
        expect(mapRange(5, 0, 10, 100, 0)).toBe(50);
    });
});
