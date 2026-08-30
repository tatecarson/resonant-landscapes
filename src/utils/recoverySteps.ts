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

const STEPS: Record<BlockedCapability, Record<WalkPlatform, string[]>> = {
    location: {
        ios: [
            "In Safari, tap AA in the address bar, then Website Settings → Location → Allow.",
            "Still blocked? Settings → Privacy & Security → Location Services, and turn on both Location Services and Safari Websites.",
            "Come back here and reload the page.",
        ],
        android: [
            "In Chrome, tap the icon to the left of the address bar, then Permissions → Location → Allow.",
            "Still blocked? Settings → Location, and turn it on.",
            "Come back here and reload the page.",
        ],
        other: [
            "Allow location for this site in your browser's site settings.",
            "Check that location is turned on for your whole phone.",
            "Come back here and reload the page.",
        ],
    },
    orientation: {
        ios: [
            // Apple has moved this switch (Settings → Safari, then Settings →
            // Apps → Safari) and appears to have dropped it entirely by iOS 26,
            // where a walker reported Location but no Motion & Orientation row.
            // So this leads with the recovery that does not depend on it.
            "Safari remembers that you said no to this site. Clear it under Settings → Apps → Safari → Advanced → Website Data, then open the link again.",
            "Some iOS versions also have a Motion & Orientation Access switch in Safari's settings. If yours has one, turn it on.",
            "Then walk to the center of a listening spot and tap Enable Rotation again.",
        ],
        android: [
            "Chrome does not ask permission for this. Either this site is blocked, or your phone has no compass.",
            "Reload the page and tap Enable Rotation again.",
            "If it still does nothing, the rest of the walk works. The volume follows your distance.",
        ],
        other: [
            "Allow motion and orientation access for this site in your browser settings.",
            "Reload the page and tap Enable Rotation again.",
        ],
    },
};

/** The headline shown above the steps. */
export const RECOVERY_TITLES: Record<BlockedCapability, string> = {
    location: "Location is blocked",
    orientation: "Rotation is blocked",
};

/**
 * One line saying what is lost, so the walker can decide whether to bother.
 * Location is fatal to the walk; orientation is not.
 */
export const RECOVERY_STAKES: Record<BlockedCapability, string> = {
    location: "The walk uses your location. Nothing will play until you turn it on.",
    orientation: "Everything else still works. The volume follows your distance. Only turning is affected.",
};

export function getRecoverySteps(
    capability: BlockedCapability,
    userAgent = ""
): string[] {
    return STEPS[capability][detectPlatform(userAgent)];
}
