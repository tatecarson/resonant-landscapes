import { describe, expect, it } from "vitest";
import { getScaledPoints } from "../utils/scaledParks";
import { MIN_ZOOM } from "./geofence";

type Coordinate = [number, number];

/** The narrowest phone the walk is laid out for (iPhone SE / mini width). */
const NARROWEST_PHONE_PX = 375;
const EARTH_RADIUS_M = 6371000;
/** Web Mercator metres per pixel at zoom 0 on the equator. */
const EQUATOR_M_PER_PX_AT_Z0 = 156543.03392;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function metresBetween([lon1, lat1]: Coordinate, [lon2, lat2]: Coordinate): number {
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

describe("MIN_ZOOM", () => {
    // Field feedback (rl-edv.6): "Can't see the whole map." The map turns with
    // the walker's heading, so fitting a site north-up is not enough: the two
    // farthest-apart listening spots have to fit across the narrow side of
    // the screen, whichever way the walker is facing.
    it.each(["dsu", "terrace", "chatham"] as const)(
        "lets a walker at %s pinch out far enough to see every listening spot at once, in any rotation",
        (variant) => {
            const spots = (getScaledPoints(variant) as { scaledCoords: Coordinate }[]).map((p) => p.scaledCoords);
            let widestPairM = 0;
            for (const a of spots) {
                for (const b of spots) widestPairM = Math.max(widestPairM, metresBetween(a, b));
            }

            const latitude = spots.reduce((sum, [, lat]) => sum + lat, 0) / spots.length;
            const metresPerPx = (EQUATOR_M_PER_PX_AT_Z0 / 2 ** MIN_ZOOM) * Math.cos(radians(latitude));
            expect(widestPairM).toBeLessThan(NARROWEST_PHONE_PX * metresPerPx);
        },
    );
});
