/**
 * Unit tests for findClosestPark — the utility that drives prefetchParkCoords
 * and prefetchParkDistance in useGeolocationTracking.
 *
 * These tests verify that when a user enters prefetch range (~40m), the hook
 * returns the correct park coordinates and distance for the proximity animations.
 */
import { test, expect } from "@playwright/test";
import { findClosestPark, PREFETCH_DISTANCE } from "../src/utils/parkSelection";

type Park = {
    name: string;
    scaledCoords: [number, number];
};

// Real scaled coordinates used in path-replay tests
const SICA_HOLLOW: Park = {
    name: "Sica Hollow State Park",
    scaledCoords: [-97.11064914495, 44.01336371948],
};

const HARTFORD_BEACH: Park = {
    name: "Hartford Beach State Park",
    scaledCoords: [-97.11059202645, 44.01320393348],
};

// ~8m from Sica Hollow, ~18m from Hartford Beach (inside 15m enter range for Sica)
const USER_NEAR_CENTER: [number, number] = [-97.110649, 44.01329];

// ~20m from Hartford Beach, ~38m from Sica Hollow (inside prefetch, outside enter for both)
const USER_APPROACHING: [number, number] = [-97.110649, 44.01302];

// ~72m from Hartford Beach, ~90m from Sica Hollow (outside prefetch range)
const USER_FAR: [number, number] = [-97.110649, 44.01255];

test.describe("findClosestPark", () => {
    test("returns closest park and its distance when user is near center", () => {
        const result = findClosestPark(USER_NEAR_CENTER, [SICA_HOLLOW, HARTFORD_BEACH]);

        expect(result).not.toBeNull();
        expect(result!.park.name).toBe("Sica Hollow State Park");
        expect(result!.distance).toBeLessThan(15);
    });

    test("returns closest park when user is in prefetch range but outside enter range", () => {
        const result = findClosestPark(USER_APPROACHING, [SICA_HOLLOW, HARTFORD_BEACH]);

        expect(result).not.toBeNull();
        expect(result!.distance).toBeGreaterThan(15);
        expect(result!.distance).toBeLessThan(PREFETCH_DISTANCE);
    });

    test("returns a result even when user is far away (caller checks range)", () => {
        const result = findClosestPark(USER_FAR, [SICA_HOLLOW, HARTFORD_BEACH]);

        // findClosestPark always returns the closest — caller decides if in range
        expect(result).not.toBeNull();
        expect(result!.distance).toBeGreaterThan(PREFETCH_DISTANCE);
    });

    test("caller can gate on prefetch distance to get prefetchParkCoords behavior", () => {
        const near = findClosestPark(USER_APPROACHING, [SICA_HOLLOW, HARTFORD_BEACH]);
        const far = findClosestPark(USER_FAR, [SICA_HOLLOW, HARTFORD_BEACH]);

        const nearCoords = near && near.distance < PREFETCH_DISTANCE ? near.park.scaledCoords : null;
        const farCoords = far && far.distance < PREFETCH_DISTANCE ? far.park.scaledCoords : null;

        // Hartford Beach is closest at USER_APPROACHING (~20m vs ~38m for Sica Hollow)
        expect(nearCoords).toEqual(HARTFORD_BEACH.scaledCoords);
        expect(farCoords).toBeNull();
    });

    test("returns null for empty park list", () => {
        const result = findClosestPark(USER_NEAR_CENTER, []);

        expect(result).toBeNull();
    });

    test("returns the single park regardless of distance", () => {
        const result = findClosestPark(USER_FAR, [SICA_HOLLOW]);

        expect(result!.park.name).toBe("Sica Hollow State Park");
    });
});
