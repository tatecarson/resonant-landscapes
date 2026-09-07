import { CENTER_ROTATION_RADIUS_METERS, ENTER_DISTANCE_METERS } from "../config/geofence";

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
 * What is left of the basemap at a given distance: all of it at the threshold,
 * none of it by the time the walker is standing in the spot.
 *
 * It goes entirely rather than thinning to a ghost. A map at fifteen percent
 * is not a map anybody reads, it is a texture under the colour, and leaving it
 * there was hedging on the one sentence this whole gesture exists to say —
 * that once you are inside the recording, navigation is over. What is left is
 * the field, the spot's own glow and the walker's marker, which are the three
 * things that still have something to tell them.
 *
 * Gone by CENTER_ROTATION_RADIUS_METERS, which is not a second threshold
 * dropped into the middle of the dissolve but the same one the walk already
 * has: three metres is where the walker counts as standing at the centre and
 * where turning starts to mean something. The tiles finish clearing exactly as
 * rotation takes the screen, so the sweep runs on colour rather than over a
 * ghost of a street plan.
 */
export function basemapOpacity(distanceMeters: number): number {
    if (!Number.isFinite(distanceMeters)) {
        return 1;
    }

    const span = ENTER_DISTANCE_METERS - CENTER_ROTATION_RADIUS_METERS;
    const remaining = (distanceMeters - CENTER_ROTATION_RADIUS_METERS) / span;
    return Math.min(1, Math.max(0, remaining));
}
