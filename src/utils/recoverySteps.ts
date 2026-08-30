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
            "Still blocked? Settings → Privacy & Security → Location Services, and turn on Location Services, Safari Websites, and Precise Location.",
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
            // There is no setting for this on any iOS we support. The
            // "Motion & Orientation Access" switch lived under Settings →
            // Safari → Privacy & Security on iOS 12 and was removed in iOS 13,
            // when requestPermission() replaced it; our floor is iOS 15. Naming
            // it would send a walker hunting for a row that is not there, which
            // is what an earlier draft of this copy did. Clearing the site's
            // stored answer is what actually makes Safari ask again.
            // Ordered lightest first, and measured on a real iPhone rather
            // than inferred. On iOS 26.6.1: the prompt does still appear on a
            // first ask, and a denied answer survives a page reload — tapping
            // Enable Rotation after refreshing goes straight back to this
            // panel with no prompt, because requestPermission returns the
            // cached "denied" without asking. So reloading is not a remedy and
            // is deliberately not offered as one.
            //
            // Quitting Safari from the app switcher does clear it: the prompt
            // comes back, and granting it makes rotation work. Also measured on
            // 26.6.1, so step two is the remedy, not a guess.
            //
            // That matches the older of the two accounts in the wild (three.js
            // #17713: cached "even in new tabs, until you restart safari") and
            // rules out the newer one (a 2022 W3C note claiming reload clears
            // it), on both halves.
            //
            // Website Data stays last, and is the one step here still unproven,
            // which is the right place for it: it sits beside a Remove All
            // button that would sign the walker out of every site they use, to
            // fix a compass. Nobody who follows step two should reach it.
            "There is no iOS setting for this, only the prompt, and Safari remembers your answer. It has to be asked again.",
            "Quit Safari from the app switcher, open the link again, walk to the center of a listening spot, and tap Enable Rotation. Choose Allow this time.",
            "Still not asking? Delete this site's entry under Settings → Apps → Safari → Advanced → Website Data. Do not tap Remove All Website Data. Then tap Enable Rotation again.",
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
