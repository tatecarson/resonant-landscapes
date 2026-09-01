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
 * Rules live elsewhere and import from here. utils/capabilities decides which
 * checks failed and utils/recoverySteps decides which platform's steps apply;
 * both take their wording from this file, so there is one place to read the
 * walk's voice and one place to change it.
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
    headphones: "Use headphones. Non-noise-canceling ones work best.",
    /** iOS asks for motion access separately, and only when rotation is used. */
    accessWithRotation:
        "Start will request audio access. Rotation access comes later, when you need it.",
    accessAudioOnly: "Start will request audio access.",
    start: "Start",
    /** Shown instead of Start when something essential is missing. */
    startAnyway: "Start anyway",
    /**
     * The way out after Start has failed. The welcome screen cannot be
     * dismissed by tapping beside it, because that only ever happened by
     * accident and left the walker on a map with no sound and nothing saying
     * why. This is the deliberate version of the same move, offered only once
     * there is a reason to want it. A park still offers its own start button,
     * so this is not a decision to walk in silence.
     */
    skipUnlock: "Go to the map anyway",
    /**
     * Shown when Start could not turn the sound on.
     *
     * Deliberately not the exception, for the same reason audio.error.detail
     * is not: "NotAllowedError: The request is not allowed by the user agent"
     * is unreadable to someone standing on a sidewalk, and it reads as a
     * crash rather than something to press again. The exception still reaches
     * the console and the debug panel.
     *
     * Deliberately not the silent switch either, which is what help.tips
     * offers and what this first said. The three ways unlockAudio can fail
     * are a context that is not ready, a browser that refused to resume it,
     * and a priming node that would not build. None of them are the silent
     * switch: that decides whether you hear sound already playing, which is a
     * later problem in a different place. Pressing again is what clears a
     * refused resume, and a browser that keeps refusing is the real cause, so
     * those are the two things named.
     */
    unlockFailed:
        "The sound did not start. Press start again. If it still will not start, open this link in Safari on an iPhone, or Chrome on Android.",
    preflight: {
        blocked: "The walk will not work here",
        needsPhone: "This walk needs a phone",
        inAppBrowser: "Open this in your phone's browser",
        partial: "Part of the walk will not work here",
    },
    /**
     * Shown when the page is sitting inside another app's browser. There is
     * no way to send someone to Safari from in here, so this is the taps they
     * have to make themselves, plus a copied link for when they cannot find
     * the menu.
     */
    openInBrowser: {
        steps: {
            ios: "Tap the arrow or the three dots at the edge of this window, then choose Open in Safari.",
            android: "Tap the three dots at the top of this window, then choose Open in browser.",
            other: "Open this link in your phone's own browser. Safari on iPhone, Chrome on Android.",
        },
        copyLink: "Copy link",
        copyLinkAriaLabel: "Copy the link to this walk",
        copied: "Copied. Paste it into Safari or Chrome.",
        copyFailed: "This app would not let the link be copied. Use its menu to open this page in your browser.",
    },
} as const;

/**
 * What is left on screen when a piece of the app has crashed or is still
 * arriving.
 *
 * These were inline: a bare "Error" in two error boundaries and "Loading
 * map...". One word of technical shorthand is not something a walker can act
 * on, and it was the last thing they would see.
 */
export const app = {
    loadingMap: "Loading the map.",
    crashed: "Something went wrong. Reload the page to start again.",
    parkPanelCrashed: "This park did not open. Walk away and back, or reload the page.",
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

/** The park strip. */
export const park = {
    tracking: "↻ tracking",
    trackingAriaLabel: "Spatial tracking active",
    stopTracking: "× stop tracking",
    enableRotation: "Enable rotation",
    recordingOf: (number: number, total: number) => `recording ${number} of ${total}`,
} as const;

/** Audio state, both the visible label and what a screen reader is told. */
export const audio = {
    stop: "Stop",
    resume: "Resume Audio",
    start: "Start Audio",
    stopAriaLabel: "Stop playback",
    resumeAriaLabel: "Resume audio after interruption",
    startAriaLabel: "Start playback fallback",
    loading: {
        initializing: "Starting audio",
        preparing: "Loading audio",
        ready: "Audio ready",
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
    /** Shown when the browser could not play the 8-channel recording. */
    degraded: {
        downmixed: "Plain mix · no surround",
        noFallback: "Surround unavailable · no plain mix",
    },
    /**
     * Shown while a park is playing, because "Playing automatically" is true
     * of the app and can be false of the walker. A silenced phone hears
     * nothing while the strip reports the recording is running, and the only
     * place that said so was help.tips, behind a tap on the Help modal.
     *
     * Said rather than detected, because it cannot be detected and cannot be
     * worked around. There is no API for the ringer state on any iOS version.
     * Declaring a playback audio session was the obvious fix and was tried:
     * on a real iPhone, silent mode on stayed silent, so the experiment was
     * removed. See rl-8ei before proposing it again.
     *
     * Names the state, not the hardware. Apple's word for the switch is the
     * Ring/Silent switch, but iPhone 15 Pro and later replaced it with the
     * Action button, and the support floor is iOS 15, so both are in a
     * walker's hand. "Silent mode" is Apple's name for the state either
     * produces, and it is what Control Center shows, so it is right for a
     * walker holding either.
     *
     * The strip carries it briefly when each park starts playing. Keeping it
     * visible throughout playback reads as a false warning when sound works.
     */
    silence: {
        ios: "No sound? Turn off silent mode",
        android: "No sound? Check the media volume",
        other: "No sound? Check the volume",
    },
} as const;

/**
 * Where the next park is, and how much of the walk is left.
 *
 * Outside prefetch range the map showed a walker their own dot and nothing
 * else: no indication that there was anywhere to go, how far, or which way.
 * That is the state a walk spends most of its time in.
 *
 * The bearing is eight points of the compass rather than degrees, because
 * this is read while moving. Screen readers get the point spelled out, since
 * "NE" is read as two letters.
 */
export const wayfinding = {
    /**
     * Rendered beside the park name rather than inside one string, so a long
     * name truncates and this survives. "Fort Sisseton Historic State Park"
     * is 33 characters and already overflows a narrow phone; losing the end
     * of the name costs nothing, and losing the distance and the bearing
     * costs the walker the only two things they can act on.
     */
    nearestMetrics: (meters: number, point: string) => ` · ${meters} m ${point}`,
    nearestAriaLabel: (park: string, meters: number, spokenPoint: string) =>
        `Nearest park: ${park}, ${meters} metres to the ${spokenPoint}`,
    spokenPoints: {
        N: "north",
        NE: "north east",
        E: "east",
        SE: "south east",
        S: "south",
        SW: "south west",
        W: "west",
        NW: "north west",
    },
    /**
     * Counted in parks heard rather than parks visited, because walking
     * through one while the audio was still downloading is not hearing it.
     */
    heardCount: (heard: number, total: number) => `${heard} of ${total} heard`,
    allHeard: "Every park heard",
} as const;

/**
 * What is true with no signal.
 *
 * Deliberately modest about what still works. The walk opens without a
 * connection because its own files are held on the phone, but the park
 * recordings are not, and neither is any part of the map the walker has not
 * already looked at. A notice promising an offline walk would be the same
 * class of lie as the strip reporting playback into a silenced phone.
 */
export const connection = {
    offline: {
        title: "No signal",
        detail:
            "The walk stays open, but park recordings will not download and new parts of the map will not appear. It picks up again when the signal does.",
    },
} as const;

/** Rotation, which iOS gates behind its own permission prompt. */
export const rotation = {
    allowAccess: "Allow Orientation Access",
    heading: "heading",
    /** Offered when the walk can continue without the refused permission. */
    continueWithout: "Continue without it",
} as const;

export const map = {
    /**
     * Shown only once the walker has dragged the map away from themselves.
     * Until then the map follows them and there is nothing to undo.
     */
    recenter: "Recenter",
    recenterAriaLabel: "Center the map back on you",
    helpButtonLabel: "Open field guide",
} as const;

/**
 * What a browser cannot do, in the walker's terms rather than the web's.
 * utils/capabilities owns the detection; this owns the wording.
 */
export const capability = {
    phone: {
        label: "A phone",
        detail: "This is a walk. It needs a phone you carry outdoors. On a computer you can look at the map, but nothing will play as you move.",
    },
    audio: {
        label: "Sound",
        detail: "This browser cannot play sound at all. Open this link in Safari on an iPhone, or Chrome on Android.",
    },
    decode: {
        label: "Park recordings",
        detail: "This browser cannot play the park recordings. Open this link in Safari on an iPhone, or Chrome on Android.",
    },
    geolocation: {
        label: "Location",
        detail: "This browser cannot share your location, so the walk cannot tell which park you are standing in.",
    },
    browser: {
        label: "Your phone's browser",
        detail: "This page opened inside another app rather than in Safari or Chrome. Sound and turning often do not work in there.",
    },
    orientation: {
        label: "Turning",
        detail: "This device cannot tell which way it is facing, so turning will not rotate the sound. Everything else works. The volume still follows your distance.",
    },
} as const;

/**
 * Getting a refused permission back, per platform. utils/recoverySteps owns
 * which set applies; this owns what they say.
 *
 * Ordered lightest first everywhere. The heaviest step on iOS sits beside a
 * Remove All Website Data button that would sign the walker out of every site
 * they use, so it is never the opening move.
 */
export const recovery = {
    titles: {
        location: "Location is blocked",
        orientation: "Rotation is blocked",
    },
    /** One line on what is lost, so the walker can decide whether to bother. */
    stakes: {
        location: "The walk uses your location. Nothing will play until you turn it on.",
        orientation:
            "Everything else still works. The volume follows your distance. Only turning is affected.",
    },
    steps: {
        location: {
            ios: [
                "In Safari, tap the page menu beside the address bar. It is a small rectangle icon on iOS 26 and reads AA on older versions. Then Website Settings → Location → Allow.",
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
            // Measured on an iPhone running 26.6.1: the prompt still appears
            // on a first ask, a denied answer survives a page reload, and
            // quitting Safari clears it. There is no Settings switch on any
            // supported iOS. See README's verified-behaviour table.
            ios: [
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
    },
} as const;
