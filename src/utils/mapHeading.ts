export const HEADING_FRESHNESS_MS = 3000;

export type HeadingSample = { radians: number; receivedAt: number } | null;

/** Facing takes priority over travel direction, even at walking speed. */
export function selectMapHeading(
    compass: HeadingSample,
    gps: HeadingSample,
    gpsMoving: boolean,
    previous: number,
    now: number,
): number {
    const fresh = (sample: HeadingSample) => sample !== null &&
        Number.isFinite(sample.radians) && now - sample.receivedAt < HEADING_FRESHNESS_MS;
    if (fresh(compass)) return compass!.radians;
    if (gpsMoving && fresh(gps)) return gps!.radians;
    return previous;
}
