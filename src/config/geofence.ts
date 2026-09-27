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
 * Zoom floor: how far out a walker may pinch. About 780 m across a 375 px
 * phone, which holds every listening spot of every site at once, whichever
 * way the map has turned: the farthest-apart pair is 693 m at Chatham and
 * 520 m at Terrace. geofence.test.ts pins that per site.
 *
 * It sat one level higher, at about 390 m, until a first-time walker at the
 * field test said she could not see the whole map (rl-edv.6). That fitted DSU
 * and nothing else, and because the map turns with the walker's heading,
 * Chatham's 686 m north-south run could need all of it across the narrow
 * side of the screen.
 *
 * It moved by exactly one level, not to the smallest value that fits, for the
 * ceiling's sake. OpenLayers derives the zoom-in stop from this floor (see
 * MAX_ZOOM), keeping only whole levels above it, so a whole-level move keeps
 * the stop exactly where it was and a fractional one would have pulled it in.
 * PR 84 and rl-1u7.10 left Terrace unfitted believing an overview had to cost
 * close zoom; it does not, if the floor moves in whole levels.
 *
 * The odd precision is inherited: it is the zoom the view settled at for the
 * scaled debug map, captured rather than chosen, less one.
 */
export const MIN_ZOOM = 15.72582728647343;

/**
 * Zoom ceiling, just under 20 so the view never sits exactly on the stop.
 *
 * Note that this is not the ceiling you get. OpenLayers derives the constraint
 * as minZoom + Math.floor(log2(maxResolution / minResolution)), so the
 * fractional MIN_ZOOM above floors the 4.274 span to 4 and the view actually
 * stops at MIN_ZOOM + 4 = 19.7258 (about 51 m across a screen). That is a fine
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
