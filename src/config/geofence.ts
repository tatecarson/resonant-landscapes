/**
 * Every distance and zoom the walk is tuned against, in one place.
 *
 * These were scattered as inline locals, duplicated `const`s in two
 * components, and bare numbers in the middle of the geolocation tick. That
 * matters more here than it usually would: these values were arrived at by
 * walking parks, and a change to one is a change to how the piece behaves
 * outdoors. They should be readable together and hard to fork by accident.
 */

/** Metres from a park's centre at which its audio starts. */
export const ENTER_DISTANCE_METERS = 15;

/**
 * Metres at which it stops. Deliberately wider than ENTER_DISTANCE_METERS:
 * the gap is hysteresis, so GPS jitter at the boundary cannot re-trigger the
 * park over and over.
 */
export const EXIT_DISTANCE_METERS = 18;

/**
 * Metres at which a park starts downloading and its approach ring appears.
 * Payloads run to ~10 MB, so this has to be far enough out that the audio is
 * ready by the time the walker arrives.
 */
export const PREFETCH_DISTANCE_METERS = 40;

/**
 * Metres within which the walker counts as standing at the centre, which is
 * where head rotation is meaningful. Small, because spatial audio only reads
 * as directional when you are essentially on the spot.
 */
export const CENTER_ROTATION_RADIUS_METERS = 3;

/**
 * Metres within which the map latches to centre-on-user. Wider than
 * CENTER_ROTATION_RADIUS_METERS so ordinary GPS drift at the centre does not
 * flick map centring on and off while the walker stands still.
 */
export const CENTER_LATCH_RADIUS_METERS = 5;

/**
 * Zoom floor: how far out a walker may pinch. About 405 m across a phone
 * screen, which covers the whole 293 m DSU site. The 520 m Terrace site does
 * not fit at once and has to be panned.
 *
 * The odd precision is not arbitrary: it is the zoom the view settled at for
 * the scaled debug map, captured rather than chosen.
 *
 * PR 84 left the Terrace question here for rl-1u7.10, and rl-1u7.10 is
 * leaving it alone. Two reasons. Lowering this floor to fit 520 m would also
 * lower the ceiling, because OpenLayers derives the ceiling from it (see
 * MAX_ZOOM below), so the walk would trade close zoom for an overview.
 * And the overview was only ever a way to answer "where do I go next",
 * which the nearest-park chip now answers directly, with a distance and a
 * bearing, from wherever the walker is standing.
 */
export const MIN_ZOOM = 16.72582728647343;

/**
 * Zoom ceiling, just under 20 so the view never sits exactly on the stop.
 *
 * Note that this is not the ceiling you get. OpenLayers derives the constraint
 * as minZoom + Math.floor(log2(maxResolution / minResolution)), so the
 * fractional MIN_ZOOM above floors the 3.274 span to 3 and the view actually
 * stops at MIN_ZOOM + 3 = 19.7258 (about 51 m across a screen). That is a fine
 * place to stop, so it is left alone rather than tuned, but it is measured and
 * pinned by map-camera.spec.ts so it cannot drift unnoticed.
 */
export const MAX_ZOOM = 19.9999999;

/**
 * The one scale the walk is read at. About 118 m across a phone screen, which
 * holds the walker and a few neighbouring parks at once (they sit 16 to 63 m
 * apart on the DSU site).
 *
 * There used to be a second zoom the map animated to when a park came into
 * range, and it never worked: the per-fix setCenter cancelled the animation
 * within a frame. Restoring it was one option; not having it is the other, and
 * that is what this is. Of the 38 locative audio tours surveyed by Roth et al.
 * (LBS 2023) only 9 tie zoom to a geofence, and they note that a scale change
 * on arrival at a point of interest can disorient. Arrival here is already
 * marked by the ring, the strip and the sound starting, none of which move the
 * ground under the walker.
 */
export const RESTING_ZOOM = 18.5;
