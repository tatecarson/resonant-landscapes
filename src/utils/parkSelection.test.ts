import { describe, expect, it } from "vitest";
import {
    PREFETCH_DISTANCE,
    findClosestPark,
    findParksInRange,
    selectNearestInRangePark,
} from "./parkSelection";

/**
 * These three functions decide which park the walker is at, which are drawn
 * on the approach ring, and when audio starts downloading. They run on every
 * GPS tick, so an off-by-one on a boundary is a park that triggers a metre too
 * early or never triggers at all.
 *
 * Positions are laid out north of a reference point, where a degree of
 * latitude is ~111.2 km, so 0.00009° ≈ 10 m.
 */
const origin: [number, number] = [-97.110649, 44.013];
const metresNorth = (metres: number): [number, number] => [
    origin[0],
    origin[1] + metres / 111195.08,
];

const park = (name: string, metres: number) => ({
    name,
    scaledCoords: metresNorth(metres),
});

const near = park("Sica Hollow State Park", 10);
const middle = park("Hartford Beach State Park", 25);
const far = park("Roy Lake State Park", 80);

describe("findClosestPark", () => {
    it("returns null for an empty park list", () => {
        expect(findClosestPark(origin, [])).toBeNull();
    });

    it("returns the only park regardless of how far away it is", () => {
        const result = findClosestPark(origin, [far]);

        expect(result?.park.name).toBe(far.name);
        expect(result?.distance).toBeGreaterThan(PREFETCH_DISTANCE);
    });

    it("returns the closest park and its distance", () => {
        const result = findClosestPark(origin, [far, middle, near]);

        expect(result?.park.name).toBe(near.name);
        expect(result?.distance).toBeCloseTo(10, 1);
    });

    it("ignores array order", () => {
        const forwards = findClosestPark(origin, [near, middle, far]);
        const backwards = findClosestPark(origin, [far, middle, near]);

        expect(forwards?.park.name).toBe(backwards?.park.name);
    });

    it("keeps the first of two equidistant parks", () => {
        const west = { name: "West", scaledCoords: metresNorth(20) };
        const east = { name: "East", scaledCoords: metresNorth(20) };

        // Strict `<` on the running minimum, so a tie does not displace the
        // incumbent — the active park stays put instead of flickering.
        expect(findClosestPark(origin, [west, east])?.park.name).toBe("West");
    });

    it("returns a park outside every range, leaving the range check to callers", () => {
        const result = findClosestPark(origin, [far]);

        // This is what makes prefetch gating a caller decision:
        // `result.distance < PREFETCH_DISTANCE ? result.park.scaledCoords : null`
        expect(result).not.toBeNull();
        expect(result!.distance).toBeGreaterThan(PREFETCH_DISTANCE);
    });
});

describe("findParksInRange", () => {
    it("returns an empty array when nothing is in range", () => {
        expect(findParksInRange(origin, [far], PREFETCH_DISTANCE)).toEqual([]);
    });

    it("returns every park inside the radius with its distance", () => {
        const result = findParksInRange(origin, [near, middle, far], PREFETCH_DISTANCE);

        expect(result).toHaveLength(2);
        expect(result.map((entry) => entry.distance.toFixed(0))).toEqual(["10", "25"]);
    });

    it("returns coordinates rather than parks, for the ring layer", () => {
        const [first] = findParksInRange(origin, [near], PREFETCH_DISTANCE);

        expect(first.coords).toEqual(near.scaledCoords);
    });

    it("excludes a park sitting exactly on the boundary", () => {
        const boundary = park("Boundary", PREFETCH_DISTANCE);

        // The comparison is `distance < maxDistance`, so the ring appears just
        // inside 40 m rather than at it.
        expect(findParksInRange(origin, [boundary], PREFETCH_DISTANCE)).toEqual([]);
    });

    it("preserves input order", () => {
        const result = findParksInRange(origin, [middle, near], PREFETCH_DISTANCE);

        expect(result.map((entry) => entry.distance.toFixed(0))).toEqual(["25", "10"]);
    });
});

describe("selectNearestInRangePark", () => {
    it("returns null when every park is out of range", () => {
        expect(selectNearestInRangePark(origin, [middle, far], 15)).toBeNull();
    });

    it("returns null for an empty park list", () => {
        expect(selectNearestInRangePark(origin, [], 15)).toBeNull();
    });

    it("returns the nearest park within range, not merely the first", () => {
        const result = selectNearestInRangePark(origin, [middle, near], PREFETCH_DISTANCE);

        expect(result?.name).toBe(near.name);
    });

    it("returns the park itself, not a wrapper", () => {
        expect(selectNearestInRangePark(origin, [near], 15)).toBe(near);
    });

    it("excludes a park exactly on the boundary", () => {
        const boundary = park("Boundary", 15);

        expect(selectNearestInRangePark(origin, [boundary], 15)).toBeNull();
    });
});

describe("PREFETCH_DISTANCE", () => {
    it("is 40 m — the approach-ring and audio-prefetch radius", () => {
        // Asserted because the approach-ring specs and the audio prefetch path
        // both assume this number; changing it silently changes both.
        expect(PREFETCH_DISTANCE).toBe(40);
    });
});
