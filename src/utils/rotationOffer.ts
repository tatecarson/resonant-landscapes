/**
 * When the walk offers head rotation, and when rotation stays on.
 *
 * Both used to hang on the live distance to the spot being 3 m or less,
 * checked on every fix. Phone GPS drifts 5 to 15 m with the walker standing
 * still, so the offer blinked in and out or never appeared, and rotation,
 * once on, was switched off again by the next fix that wandered past 3 m.
 * A first-time walker at the field test never saw it at all (rl-edv.5).
 *
 * The centre is now a place the walker has reached, not a distance they are
 * currently at: useGeolocationTracking latches it once they come within
 * CENTER_LATCH_RADIUS_METERS and holds it until they leave the park. That is
 * the same latch the map already centres on, so the offer, the map and the
 * rotation all agree about where the walker is.
 */
export type RotationOfferInput = {
    /** Rotation is heard, so it is only offered while the park is playing. */
    isPlaying: boolean;
    /** The walker has reached this park's centre and not left the park since. */
    reachedCenter: boolean;
};

/** Whether "Enable rotation" is offered. */
export function canOfferRotation({ isPlaying, reachedCenter }: RotationOfferInput): boolean {
    return isPlaying && reachedCenter;
}

/**
 * Whether rotation, once on, stays on. It no longer depends on the live
 * distance: drifting a few metres off the spot is not leaving it.
 */
export function rotationStaysOn({ reachedCenter }: Pick<RotationOfferInput, "reachedCenter">): boolean {
    return reachedCenter;
}
