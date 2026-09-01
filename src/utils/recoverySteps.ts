/**
 * What to actually do when the walk is blocked on a permission.
 *
 * "Allow location in your browser settings" is not an instruction, it is a
 * restatement of the problem — and it is read by someone standing outside,
 * possibly holding the phone in one hand, who has already driven somewhere.
 * These are the taps, in order, for the two browsers the piece targets.
 *
 * Permission state is deliberately not detected here. iOS Safari does not
 * support navigator.permissions.query for geolocation, and
 * DeviceOrientationEvent.requestPermission only answers inside a user gesture,
 * so there is no way to know at page load whether either was denied. These
 * steps are therefore shown in response to an actual denial — a
 * PERMISSION_DENIED error, or a requestPermission that came back "denied" —
 * which is also the only moment they are worth reading.
 */

import { recovery } from "../copy";

export type BlockedCapability = "location" | "orientation";
export type WalkPlatform = "ios" | "android" | "other";

/**
 * Which set of instructions to show. Copy only — never gate a capability on
 * this. iPadOS reports itself as a Mac, and the fallback text is safe anyway.
 */
export function detectPlatform(userAgent = ""): WalkPlatform {
    if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
    if (/Android/i.test(userAgent)) return "android";
    return "other";
}

/** The headline shown above the steps. */
export const RECOVERY_TITLES: Record<BlockedCapability, string> = recovery.titles;

/**
 * One line saying what is lost, so the walker can decide whether to bother.
 * Location is fatal to the walk; orientation is not.
 */
export const RECOVERY_STAKES: Record<BlockedCapability, string> = recovery.stakes;

export function getRecoverySteps(
    capability: BlockedCapability,
    userAgent = ""
): readonly string[] {
    return recovery.steps[capability][detectPlatform(userAgent)];
}
