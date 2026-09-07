import { ENTER_DISTANCE_METERS } from "../config/geofence";

/**
 * How far through the arrival a walker is: 0 at the threshold, 1 standing on
 * the spot.
 *
 * Three surfaces read this — the field over the map (ArrivalField), the glow
 * under the spot (ParkGlowLayer) and the basemap's own opacity — and they only
 * read as one gesture if they are all the same function of the same distance.
 * That is the whole reason this is a module rather than three inline
 * expressions: the seam this fixes was three unrelated curves meeting at one
 * boundary.
 *
 * Linear, deliberately, where ProximityWarmth's approach ramp is squared. The
 * squared falloff there is spending a hundred metres of range on the last
 * twenty; this is the last fifteen, where every metre is already worth the
 * same and a curve would put the crescendo somewhere other than the centre.
 *
 * The hysteresis band is handled by clamping rather than by a second
 * threshold. A park stays open out to EXIT_DISTANCE_METERS (18 m) but this
 * returns 0 for everything beyond ENTER_DISTANCE_METERS (15 m), so a walker
 * loitering on the boundary sees the field held at its floor rather than a
 * dissolve that plays and reverses on every jitter of the fix. The floor is
 * exactly the strength the approach tint hands over at, so nothing moves
 * there at all.
 */
export function arrivalProgress(distanceMeters: number): number {
    if (!Number.isFinite(distanceMeters)) {
        return 0;
    }

    const progress = (ENTER_DISTANCE_METERS - distanceMeters) / ENTER_DISTANCE_METERS;
    return Math.min(1, Math.max(0, progress));
}

/**
 * What is left of the basemap with the walker standing on the spot.
 *
 * Not zero. The tiles carry the paths and the buildings, and a walker who
 * turns round at the centre and wants to leave should not have to wait for a
 * fade to get their bearings back — but they are inside the recording now, and
 * a map at full strength is the app still insisting they are going somewhere.
 * Low enough that the field over it is plainly the subject; present enough to
 * still be a map.
 */
export const BASEMAP_ARRIVED_OPACITY = 0.15;
