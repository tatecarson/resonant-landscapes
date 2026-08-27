import { describe, expect, it } from "vitest";
import { distanceInMeters, scaleCoordinates } from "./geo";

/**
 * Every proximity decision in the app — park entry at 15 m, exit at 18 m,
 * prefetch at 40 m — is this haversine. A sign error or a swapped lon/lat
 * would not throw; it would quietly move the listening areas somewhere else
 * in the park, which is only discoverable by walking there.
 */
describe("distanceInMeters", () => {
    it("is zero for a point and itself", () => {
        expect(distanceInMeters([-97.110649, 44.01329], [-97.110649, 44.01329])).toBe(0);
    });

    it("measures one degree of latitude as ~111.2 km", () => {
        expect(distanceInMeters([0, 0], [0, 1])).toBeCloseTo(111195.08, 1);
    });

    it("shrinks a degree of longitude by cos(latitude)", () => {
        const atEquator = distanceInMeters([0, 0], [1, 0]);
        const atSixtyNorth = distanceInMeters([0, 60], [1, 60]);

        // cos(60°) = 0.5, so the same degree spans half the ground.
        expect(atSixtyNorth / atEquator).toBeCloseTo(0.5, 3);
    });

    it("is symmetric", () => {
        const a: [number, number] = [-97.110649, 44.01329];
        const b: [number, number] = [-97.110789, 44.012222];

        expect(distanceInMeters(a, b)).toBeCloseTo(distanceInMeters(b, a), 10);
    });

    it("resolves the tens-of-metres scale the geofences actually use", () => {
        // ~15 m apart: the park enter radius.
        const distance = distanceInMeters(
            [-97.110649, 44.01329],
            [-97.110649, 44.013425]
        );

        expect(distance).toBeGreaterThan(14);
        expect(distance).toBeLessThan(16);
    });

    it("handles antipodal points without NaN from a domain error", () => {
        // asin(sqrt(a)) with a floating just above 1 would return NaN.
        expect(distanceInMeters([0, 0], [180, 0])).toBeCloseTo(20015114.44, 1);
    });

    it("takes coordinates as [longitude, latitude], not the reverse", () => {
        // Same four numbers, swapped roles. Reading these as [lat, lon] would
        // put the two parks 25 km closer together.
        const asLonLat = distanceInMeters([-97, 44], [-96, 45]);
        const asLatLon = distanceInMeters([44, -97], [45, -96]);

        expect(asLonLat).toBeCloseTo(136578.6, 0);
        expect(asLatLon).toBeCloseTo(111901.1, 0);
    });
});

/**
 * The debug map compresses the real parks into a walkable area around a
 * reference point. Getting this wrong moves every test park at once.
 */
describe("scaleCoordinates", () => {
    const reference: [number, number] = [-97.110789, 44.012222];
    const scaleLong = 0.00045;
    const scaleLat = 0.00066;

    it("leaves the reference point exactly where it is", () => {
        expect(scaleCoordinates(reference, reference, scaleLong, scaleLat)).toEqual(reference);
    });

    it("scales the offset from the reference, not the coordinate itself", () => {
        const [lon, lat] = scaleCoordinates([-97.0, 44.5], reference, scaleLong, scaleLat);

        expect(lon).toBeCloseTo(reference[0] + (-97.0 - reference[0]) * scaleLong, 12);
        expect(lat).toBeCloseTo(reference[1] + (44.5 - reference[1]) * scaleLat, 12);
    });

    it("keeps points on opposite sides of the reference on opposite sides", () => {
        const east = scaleCoordinates([-96.0, 44.0], reference, scaleLong, scaleLat);
        const west = scaleCoordinates([-98.0, 44.0], reference, scaleLong, scaleLat);

        expect(east[0]).toBeGreaterThan(reference[0]);
        expect(west[0]).toBeLessThan(reference[0]);
    });

    it("pulls far-apart parks into a walkable span", () => {
        // Two parks ~200 km apart in reality land metres apart on the debug map.
        const a = scaleCoordinates([-98.5, 45.5], reference, scaleLong, scaleLat) as [number, number];
        const b = scaleCoordinates([-97.5, 43.5], reference, scaleLong, scaleLat) as [number, number];

        expect(distanceInMeters(a, b)).toBeLessThan(200);
    });
});
