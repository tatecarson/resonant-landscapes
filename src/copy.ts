/**
 * Every word the walker reads, in one place.
 *
 * It used to live inline across five components in two different voices, which
 * is how the Help modal ended up telling people to turn WiFi off without
 * saying why, and telling Android users the piece was iOS-only after they had
 * already travelled to a park.
 *
 * House style, because this is read outdoors on a phone by someone who may
 * already be stuck:
 *
 * - Say what to do. If there is nothing to do, say what is happening and stop.
 *   Never give an instruction the walker cannot follow from where they are
 *   standing: the listening spots are next to buildings, so "move away from
 *   buildings" is not advice there, it is a suggestion that they are doing
 *   something wrong.
 * - Plain words. No metaphors, no em dashes, no jargon. A browser runs
 *   software; a person takes a walk.
 * - Name the thing the walker recognises. "Turning" and "sound", not
 *   "DeviceOrientation" and "Web Audio".
 * - Never show raw error text. It cannot be acted on and it reads as a crash.
 *
 * copy.test.ts enforces the mechanical half of this.
 *
 * Strings whose wording depends on a rule live next to that rule and are
 * imported here rather than duplicated: capability checks in utils/capabilities
 * and permission recovery steps in utils/recoverySteps.
 */

import type { Variant } from "./App";

/** The welcome screen, which is the only thing shown before the walk starts. */
export const welcome = {
    title: "Resonant Landscapes",
    subtitle: "a locative sound walk",
    intro: (variant: Variant) =>
        variant === "terrace"
            ? "Walk Terrace Park to hear the soundscapes of South Dakota's 13 state parks."
            : "Walk DSU's campus to hear the soundscapes of South Dakota's 13 state parks.",
    steps: [
        "As you approach a park, a menu opens. Walk closer to the center icon and the volume increases with proximity.",
        "At the center of a listening spot, turn with your phone to hear the recording in 360 degrees.",
        "Close the menu to load a different recording. Walk away or press stop to end.",
    ],
    headphones: "Use headphones. Non-noise-canceling work best.",
    /** iOS asks for motion access separately, and only when rotation is used. */
    accessWithRotation:
        "Start will request audio access. Rotation access comes later, when you need it.",
    accessAudioOnly: "Start will request audio access.",
    start: "Start",
    /** Shown instead of Start when something essential is missing. */
    startAnyway: "Start anyway",
    preflight: {
        blocked: "The walk will not work here",
        needsPhone: "This walk needs a phone",
        partial: "Part of the walk will not work here",
    },
} as const;

/** The field guide, opened from the map. */
export const help = {
    title: "Help & About",
    subtitle: "troubleshooting · credits",
    tips: [
        // Was "Turn WiFi off for best results", with no reason given. The
        // reason is that a phone holding on to a WiFi network it has walked
        // out of range of will stall requests rather than fall back to
        // cellular, which stops park audio loading mid-walk.
        "Audio not loading as you walk? Turn WiFi off so the phone uses cellular.",
        // Was "No sound? Refresh the page or reopen the browser", which is a
        // shrug. The silent switch is the common cause and the one the walker
        // can actually check.
        "No sound? Check your phone is not on silent and turn the volume up.",
        "Enable geolocation in your phone and browser settings.",
        "Made for phones. Use Safari on iPhone or Chrome on Android. The welcome screen tells you if your browser cannot do something.",
    ],
    questionsLabel: "Questions?",
    author: "Tate Carson",
    authorEmail: "mailto:tate.carson@dsu.edu",
    keepAwake: {
        title: "Keep screen awake",
        detail: "Prevents screen lock while park audio plays. Uses more battery.",
        ariaLabel: "Keep screen awake while audio plays",
        unsupported: "Screen wake lock is not supported by this browser.",
        refused: "The phone refused the wake lock. Playback recovery remains active.",
        active: "Screen wake lock active.",
        armed: "Turns on when audio starts.",
        off: "Off.",
    },
    reduceVisuals: {
        title: "Calmer visuals",
        detail: "Stops the moving background and the pulsing rings. The sound is unchanged.",
        ariaLabel: "Use calmer visuals",
        followingSystem: "Following your phone's reduce motion setting.",
        on: "On.",
        off: "Off.",
    },
    aboutLabel: "about",
    credits:
        "By Tate Carson and Carter Gordon. Support from Dakota State University Faculty and Student Research Initiative Grants.",
    paperLabel: "Read the paper (AM '24)",
    paperAriaLabel: "Read the paper, AM 2024, opens in new tab",
    paperUrl: "https://dl.acm.org/doi/10.1145/3678299.3678354",
    projectLabel: "Project page: photos, code, and more",
    projectAriaLabel: "Project page with photos, code and more, opens in new tab",
    projectUrl: "https://www.tatecarson.com/blog/2024-09-29-resonant-landscapes",
    close: "Close",
} as const;

/**
 * What the map says when it cannot place the walker.
 *
 * Split by when each one fires. The first two happen at launch, where the
 * walker may still be indoors, so stepping outside is a real thing to do. The
 * rest happen mid-walk at a listening spot, where they are already outside and
 * possibly standing against a building, so those state the situation and stop.
 */
export const location = {
    acquiring: {
        title: "Finding you…",
        detail: "Step outside if this takes more than a moment.",
    },
    timeout: {
        title: "Can't find your location yet",
        detail: "This is taking longer than usual. Stepping outside can help.",
    },
    failed: {
        title: "Can't find your location",
        detail: "Your device could not find you. Step outside, then reload the page.",
    },
    stale: {
        title: "Signal lost",
        detail: "Your position has stopped updating, and parks will not start until it does. Give it a moment.",
    },
    imprecise: {
        title: "GPS is imprecise here",
        /** The number separates "drifting a little" from "useless under these trees". */
        detail: (accuracyMeters: number | null, enterDistance: number) =>
            accuracyMeters === null
                ? `Your position is less accurate than the ${enterDistance} m listening areas, so parks may start late or not at all.`
                : `Your position is accurate to about ${accuracyMeters} m, wider than the ${enterDistance} m listening areas. Parks may start late, early, or not at all.`,
    },
} as const;

/** The park strip and the expanded park panel. */
export const park = {
    tracking: "↻ tracking",
    trackingAriaLabel: "Spatial tracking active",
    stopTracking: "× stop tracking",
    enableRotation: "Enable rotation",
    metersAway: (meters: number) => `${meters} meters away`,
    recordingOf: (number: number, total: number) => `recording ${number} of ${total}`,
    close: "Close",
} as const;

/** Audio state, both the visible label and what a screen reader is told. */
export const audio = {
    stop: "Stop",
    resume: "Resume Audio",
    start: "Start Audio",
    stopAriaLabel: "Stop playback",
    resumeAriaLabel: "Resume audio after interruption",
    startAriaLabel: "Start playback fallback",
    label: {
        preparing: "Preparing audio",
        initializing: "Starting audio",
        playing: "Playing automatically",
        interrupted: "Audio paused by your phone",
        stopped: "Playback stopped",
        readyToStart: "Ready to start",
        ready: "Audio ready",
        warming: "Audio warming nearby",
        entering: "Entering listening zone",
    },
    compactLabel: {
        playing: "Playing",
        interrupted: "Audio paused",
        initializing: "Starting audio",
        preparing: "Loading audio",
        tapToStart: "Tap to start",
    },
    message: {
        preparingPrefetched: "Finishing the download that started as you approached.",
        preparingFresh: "Downloading this park's recording now.",
        initializing: "Initializing the audio engine for this park now.",
        playing: "Audio started when you entered the listening area.",
        interrupted: "Tap resume audio to continue this park.",
        stopped: "Tap start audio to play this park again.",
        readyToStart: "Tap start audio to begin this park.",
        ready: "Audio is ready and should begin immediately.",
        warming: "This park's recording is downloading as you approach.",
        entering: "Getting this park ready.",
    },
    /**
     * Only the states worth interrupting a screen reader for. "ready" and
     * "approaching" change often and say nothing actionable, and a live region
     * that chatters is one people switch off.
     */
    announcement: {
        error: "Audio unavailable for this park.",
        preparing: "Loading audio.",
        playing: "Audio playing.",
        interrupted: "Audio paused.",
        stopped: "Playback stopped. Activate start audio to resume.",
        ready: "Audio ready. Activate start audio to begin.",
    },
    error: {
        title: "Audio unavailable",
        /**
         * Deliberately not the exception. Raw error text cannot be acted on,
         * reads as a crash, and is meaningless to someone standing in a park.
         * The detail still goes to the console and the debug panel.
         */
        detail: "This park's recording did not load. Check your signal, then try again.",
        retry: "Retry audio load",
    },
    /**
     * Shown when the browser could not play the 8-channel recording. Terse in
     * the strip, which is the same message on every park for the whole session,
     * and complete in the expanded panel.
     */
    degraded: {
        compactDownmixed: "Plain mix · no surround",
        compactNoFallback: "Surround unavailable · no plain mix",
        downmixed:
            "This browser could not play the surround recording, so you are hearing the plain mix. The volume still follows your distance, but turning will not move the sound.",
        noFallback:
            "This browser could not play the surround recording, and this park has no plain mix. What you are hearing is not what the recording should sound like.",
    },
    timingHint: (seconds: string, cacheHit: boolean) =>
        cacheHit ? `Ready instantly (cached ${seconds}s)` : `Ready in ${seconds}s`,
} as const;

/** Rotation, which iOS gates behind its own permission prompt. */
export const rotation = {
    allowAccess: "Allow Orientation Access",
    heading: "heading",
    /** Offered when the walk can continue without the refused permission. */
    continueWithout: "Continue without it",
} as const;

export const map = {
    helpButtonLabel: "Open field guide",
} as const;
