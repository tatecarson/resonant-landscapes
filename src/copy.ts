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
    /**
     * One line per site, as a record rather than a chain of ternaries. Two
     * sites fit in a ternary; three is where it stops reading as a sentence
     * and starts reading as a puzzle, and there will be a fourth.
     */
    intro: (variant: Variant) =>
        ({
            dsu: "Walk DSU's campus to hear the soundscapes of South Dakota's 13 state parks.",
            terrace: "Walk Terrace Park to hear the soundscapes of South Dakota's 13 state parks.",
            chatham:
                "Walk Chatham's campus to hear the soundscapes of South Dakota's 13 state parks.",
        })[variant],
    steps: [
        "As you approach a listening spot, its park name and audio controls appear. Walk toward the center icon to hear the sound grow louder.",
        "At the center, tap Enable rotation if it appears. Turn with your phone to change which direction you hear.",
        "Walk to another listening spot to hear another park. Walk away or tap Stop to stop the sound.",
    ],
    headphones: "Use headphones. Non-noise-canceling ones work best.",
    /** iOS asks for motion access separately, and only when rotation is used. */
    accessWithRotation:
        "Tap Start to turn on sound for the walk. Your phone may ask permission when you enable rotation at a listening spot.",
    accessAudioOnly: "Tap Start to turn on sound for the walk.",
    start: "Start",
    /** Shown instead of Start when something essential is missing. */
    startAnyway: "Start anyway",
    /**
     * Start, while the press is being answered. The walk downloads its audio
     * engine during the welcome screen, and on the signal a walker actually
     * has at a park that can take seconds — during which an unlabelled Start
     * reads as a button that did not register the tap (rl-7om). Present tense
     * and the walk's own noun, not "Loading": what is happening is the thing
     * they asked for, already underway.
     */
    starting: "Starting the walk…",
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
        partial: "Some features may be unavailable",
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
        copyFailed: "The link could not be copied. Use this app's menu to open the page in your browser.",
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
        "Audio not loading? If you have cellular data, try turning WiFi off.",
        // Was "No sound? Refresh the page or reopen the browser", which is a
        // shrug. The silent switch is the common cause and the one the walker
        // can actually check.
        "No sound? Turn up the media volume. On iPhone, turn off silent mode.",
        "Allow location for this site and in your phone settings.",
        "Made for phones. Use Safari on iPhone or Chrome on Android. The welcome screen checks for missing features.",
    ],
    questionsLabel: "Questions?",
    author: "Tate Carson",
    authorEmail: "mailto:tate.carson@dsu.edu",
    keepAwake: {
        title: "Keep screen awake",
        detail: "Keeps the screen on while audio plays and this page is visible. Uses more battery.",
        ariaLabel: "Keep screen awake while audio plays",
        unsupported: "This browser cannot keep the screen on.",
        refused: "The screen may still lock. If the sound stops, return here and tap Resume Audio if it appears.",
        active: "Keeping the screen on.",
        armed: "On for playback while this page is visible.",
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
        title: "Location not updating",
        detail: "The map is using your last known position. Give it a moment to find you again.",
    },
    imprecise: {
        title: "Location is imprecise here",
        /** The number separates "drifting a little" from "useless under these trees". */
        detail: (accuracyMeters: number | null, enterDistance: number) =>
            accuracyMeters === null
                ? `Your position is uncertain. Sound starts within ${enterDistance} m of a listening spot, so parks may start at the wrong time.`
                : `Your phone estimates your position within about ${accuracyMeters} m. Sound starts within ${enterDistance} m of a listening spot. Parks may start early, late, or not at all.`,
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
    startAriaLabel: "Start Audio",
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
        interrupted: "Audio paused. Activate Resume Audio to continue.",
        stopped: "Playback stopped. Activate Start Audio to play again.",
        ready: "Audio ready. Activate start audio to begin.",
    },
    error: {
        title: "Audio unavailable",
        /**
         * Deliberately not the exception. Raw error text cannot be acted on,
         * reads as a crash, and is meaningless to someone standing in a park.
         * The detail still goes to the console and the debug panel.
         */
        detail: "This park's sound could not start. Try again. If it still fails, check your connection or reload the page.",
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
 * navigator.onLine reports offline, not cellular signal strength. Audio saves
 * can fail or be evicted, and map tiles have a separate bounded store. Name
 * what remains possible without promising every previously heard park.
 */
export const connection = {
    offline: {
        title: "You are offline",
        detail:
            "The walk stays open. Saved recordings can play offline. New recordings and missing map areas need a connection.",
    },
} as const;

/**
 * Keeping the walk on the home screen.
 *
 * The offer lives in the field guide and nowhere else (rl-5yp). There used to
 * be a card over the map, timed to appear just after the walker had heard a
 * park, on the reasoning that this was the moment it was most likely to be
 * accepted. That card is gone by decision, not by oversight: a popup asking
 * for something is the opposite of a piece about wandering, and it was the
 * last thing left covering the between-parks state. The cost is recorded
 * here so it is not rediscovered later as a regression in installs — most
 * walkers will never see the offer at all, because most walkers never open
 * the field guide. That is the trade Tate chose: fewer interruptions over
 * more installs.
 *
 * Two wordings, chosen by what the device can do (rl-8x0). Chromium can be
 * asked to install and will show its own dialog, so there the guide has a
 * button — and iPhone steps sitting directly above a button that does the
 * job would read as instructions for a phone the walker is not holding, so
 * there the prose is just the promise. iOS Safari has no such API at all:
 * the only route is the walker doing it by hand, so there the prose has to
 * be the steps or it is not an offer. And Chromium before it has offered
 * anything gets a third wording, because the promise alone is an offer with
 * no way to accept it (rl-8x0).
 *
 * Installing makes the walk easier to find. Audio saving also happens in a
 * browser tab and is best effort; installing neither guarantees retention
 * nor downloads the whole walk.
 */
export const install = {
    action: "Add it",
    helpTitle: "Home screen",
    /**
     * Where the button installs on request, the prose is the promise alone.
     */
    helpDetail:
        "Keep the walk on your home screen to find it again. Saved recordings can play offline, but your phone may remove them to free space.",
    /**
     * Chromium, before it has offered a button. The event Chrome fires is
     * gated on engagement and throttled on repeat visits, so a walker who
     * opens the guide in the first minute is in this state on a phone that
     * can install perfectly well — the promise on its own would be an offer
     * with no way to accept it.
     *
     * "The browser menu" rather than the three-dot glyph: this copy renders
     * in Space Mono, whose charset does not carry U+22EE, so the character
     * would fall out to another font or to tofu on the phones this is for.
     * The label named is Chrome's when a site is installable; when it is not,
     * the same menu offers Add to Home screen, which a walker already looking
     * at the menu will find.
     */
    helpDetailMenu:
        "Keep the walk on your home screen to find it again. Open the browser menu and choose Install app. Saved recordings can play offline, but your phone may remove them to free space.",
    /**
     * Where there is no button, the steps are the offer.
     */
    helpDetailManual:
        "Add the walk to your home screen to find it again. On iPhone, open it in Safari, tap Share, then Add to Home Screen. Saved recordings can play offline, but your phone may remove them to free space.",
} as const;

/** Rotation, which iOS gates behind its own permission prompt. */
export const rotation = {
    allowAccess: "Enable rotation",
    heading: "heading",
    /** Offered when rotation was refused or motion readings never arrived. */
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
        detail: "This walk is made for a phone you carry outdoors. You can also open the map on a computer.",
    },
    audio: {
        label: "Sound",
        detail: "This browser cannot play sound for this walk. Open this link in Safari on an iPhone, or Chrome on Android.",
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
        detail: "This browser cannot read which way your phone faces, so turning will not rotate the sound. Rotation is optional for listening.",
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
        orientation: "Rotation is unavailable",
    },
    /** One line on what is lost, so the walker can decide whether to bother. */
    stakes: {
        location: "The walk uses your location. Nothing will play until you turn it on.",
        orientation:
            "Turning will not rotate the sound. You can listen without rotation.",
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
                "Safari may remember a refused rotation request. If motion readings are missing, reopening Safari can also help.",
                "Quit Safari from the app switcher, open the link again, walk to the center of a listening spot, and tap Enable rotation if it appears. Choose Allow if asked.",
                "Still not asking? Delete this site's entry under Settings → Apps → Safari → Advanced → Website Data. Do not tap Remove All Website Data. Reopen the walk, return to the center, and enable rotation again.",
            ],
            android: [
                "Chrome may be blocking motion sensors, or your phone may not be sending motion readings.",
                "In Chrome, open Settings → Site settings → Motion sensors and allow access.",
                "Reload the page, return to the center of a listening spot, and tap Enable rotation if it appears.",
                "If rotation still does not work, you can listen without it.",
            ],
            other: [
                "Allow motion and orientation access for this site in your browser settings.",
                "Reload the page, return to the center of a listening spot, and tap Enable rotation if it appears.",
            ],
        },
    },
} as const;
