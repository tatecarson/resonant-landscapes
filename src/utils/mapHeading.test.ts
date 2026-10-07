import { describe, expect, it } from "vitest";
import { selectMapHeading } from "./mapHeading";

describe("map heading source", () => {
    const north = { radians: 0, receivedAt: 4000 };
    const south = { radians: Math.PI, receivedAt: 2000 };

    it("faces south while travelling north", () => {
        expect(selectMapHeading(south, north, true, 0, 4000)).toBe(Math.PI);
    });
    it("uses moving GPS when compass is missing or reaches three seconds old", () => {
        expect(selectMapHeading(null, north, true, Math.PI, 4000)).toBe(0);
        expect(selectMapHeading(south, north, true, Math.PI, 5000)).toBe(0);
    });
    it("gives a returning compass priority immediately", () => {
        expect(selectMapHeading({ ...south, receivedAt: 5100 }, north, true, 0, 5100)).toBe(Math.PI);
    });
    it("holds the last heading when stationary or both sources are stale", () => {
        expect(selectMapHeading(null, north, false, 1, 4000)).toBe(1);
        expect(selectMapHeading(south, north, true, 1, 7000)).toBe(1);
        expect(selectMapHeading(null, null, false, 1, 7000)).toBe(1);
    });
    it("ignores invalid readings", () => {
        for (const radians of [NaN, Infinity, -Infinity]) {
            expect(selectMapHeading({ radians, receivedAt: 4000 }, north, true, 1, 4000)).toBe(0);
            expect(selectMapHeading(null, { radians, receivedAt: 4000 }, true, 1, 4000)).toBe(1);
        }
    });
});
