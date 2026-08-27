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
 * Zoom floor. The odd precision is not arbitrary: it is the zoom the view
 * settles at for the scaled debug map, captured rather than chosen, and
 * rounding it visibly shifts the first frame.
 */
export const MIN_ZOOM = 16.72582728647343;

/** Zoom ceiling, just under 20 so the view never sits exactly on the stop. */
export const MAX_ZOOM = 19.9999999;

/** Zoom the map animates to when a park comes into prefetch range. */
export const PROXIMITY_ZOOM = 19;
