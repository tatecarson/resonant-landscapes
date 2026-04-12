/**
 * Unit tests for nearest-in-range park selection logic.
 * These tests run without a browser and verify the selection algorithm
 * chooses the nearest park within range, not the first one in array order.
 */
import { test, expect } from "@playwright/test";
import { selectNearestInRangePark } from "../src/utils/parkSelection";

type Park = {
  name: string;
  scaledCoords: [number, number];
};

const MAX_DISTANCE = 15;

// Real scaled coordinates from the path-replay scenario (Sica approach 3 position).
// At this point both parks are in range but Sica Hollow is nearer.
const SICA_HOLLOW: Park = {
  name: "Sica Hollow State Park",
  scaledCoords: [-97.11064914495, 44.01336371948],
};

const HARTFORD_BEACH: Park = {
  name: "Hartford Beach State Park",
  scaledCoords: [-97.11059202645, 44.01320393348],
};

// User is at Sica approach 3: 8.2m from Sica Hollow, 10.6m from Hartford Beach.
const USER_AT_APPROACH_3: [number, number] = [-97.110649, 44.01329];

test.describe("selectNearestInRangePark", () => {
  test("returns nearest park when nearer park is later in array", () => {
    // Hartford Beach (farther, 10.6m) is first; Sica Hollow (nearer, 8.2m) is second.
    // A find()-based implementation would wrongly return Hartford Beach.
    const parks: Park[] = [HARTFORD_BEACH, SICA_HOLLOW];

    const result = selectNearestInRangePark(USER_AT_APPROACH_3, parks, MAX_DISTANCE);

    expect(result?.name).toBe("Sica Hollow State Park");
  });

  test("returns nearest park when nearer park is first in array", () => {
    const parks: Park[] = [SICA_HOLLOW, HARTFORD_BEACH];

    const result = selectNearestInRangePark(USER_AT_APPROACH_3, parks, MAX_DISTANCE);

    expect(result?.name).toBe("Sica Hollow State Park");
  });

  test("returns null when no parks are within range", () => {
    const farAwayUser: [number, number] = [-97.0, 44.0];

    const result = selectNearestInRangePark(farAwayUser, [SICA_HOLLOW, HARTFORD_BEACH], MAX_DISTANCE);

    expect(result).toBeNull();
  });

  test("returns the single in-range park when only one qualifies", () => {
    // Only Hartford Beach is in range at Sica approach 1 (Sica Hollow is 27m away).
    const userAtApproach1: [number, number] = [-97.110649, 44.01312];

    const result = selectNearestInRangePark(userAtApproach1, [SICA_HOLLOW, HARTFORD_BEACH], MAX_DISTANCE);

    expect(result?.name).toBe("Hartford Beach State Park");
  });
});
