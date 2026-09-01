/**
 * What the walk needs from a browser, checked before the walker sets out.
 *
 * The support matrix in README.md says which browsers are release targets, but
 * a matrix cannot stop someone opening the piece in whatever they have. Until
 * now the only thing that told them was a line in the Help modal — read after
 * a failure, if at all — so an unsupported phone meant driving to a park and
 * discovering it there. This checks what the walk actually depends on and lets
 * the welcome screen say plainly what will and will not work.
 *
 * The capability checks are feature detection, not user-agent sniffing. Asset
 * selection in audioPaths.ts has to sniff because canPlayType lies about AAC;
 * these are simple presence checks with no such problem. Two are exceptions,
 * and both are questions about the situation rather than the engine, with no
 * feature to detect: "phone", and "browser", which asks whether a shared link
 * opened inside another app's webview. See webview.ts for why that one cannot
 * be feature-detected. Both are non-essential, so a wrong guess costs a
 * paragraph, not the walk.
 *
 * What a downmix does to the field cannot be seen from here at all — that is
 * caught after decode by channelCheck.ts.
 */

import { detectPlatform } from "./recoverySteps";
import { detectWebview, type WebviewHost } from "./webview";
import { capability as capabilityCopy } from "../copy";

export type CapabilityId =
    | "phone"
    | "browser"
    | "audio"
    | "decode"
    | "geolocation"
    | "orientation";

export type CapabilityCheck = {
    id: CapabilityId;
    /** Short name for the thing, in the walker's terms. */
    label: string;
    available: boolean;
    /** False means the walk still works, just less of it. */
    essential: boolean;
    /** What its absence means for the walk. Shown only when unavailable. */
    detail: string;
};

export type PreflightVerdict = "ok" | "partial" | "blocked";

export type Preflight = {
    checks: CapabilityCheck[];
    verdict: PreflightVerdict;
    /** Just the failures, in the order they matter. */
    problems: CapabilityCheck[];
    /**
     * True on iOS, where turning the phone needs an explicit permission
     * prompt. Not a problem — the walk asks for it at the moment it is
     * needed — but the welcome copy mentions it.
     */
    orientationNeedsPermission: boolean;
    /**
     * The app this page opened inside, or null in a real browser. Kept even
     * when the check is not a problem so the welcome screen can offer the
     * right escape route without sniffing the user agent a second time.
     */
    webviewHost: WebviewHost | null;
};

/** The globals the preflight reads, isolated so it can be tested in node. */
export type PreflightEnv = {
    /** The piece is a walk; a desk is not a place to take it. */
    isPhone: boolean;
    /** The app whose webview this is, from the user agent. */
    webviewHost: WebviewHost | null;
    audioContextCtor: unknown;
    /** `decodeAudioData` off the AudioContext prototype. */
    decodeAudioData: unknown;
    geolocation: unknown;
    deviceOrientationEvent: unknown;
    orientationRequestPermission: unknown;
};

type PreflightWindow = {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
    DeviceOrientationEvent?: unknown;
    navigator?: { geolocation?: unknown; userAgent?: string };
};

/**
 * Read the environment off a window. Split from runPreflight so the decision
 * logic is a pure function over plain data.
 */
export function readPreflightEnv(win: PreflightWindow): PreflightEnv {
    const audioContextCtor = win.AudioContext ?? win.webkitAudioContext;
    const orientation = win.DeviceOrientationEvent as
        | { requestPermission?: unknown }
        | undefined;

    const userAgent = win.navigator?.userAgent ?? "";

    return {
        isPhone: detectPlatform(userAgent) !== "other",
        webviewHost: detectWebview(userAgent),
        audioContextCtor,
        // A constructor whose prototype lacks decodeAudioData cannot load a
        // park at all, and the two have shipped separately in the past.
        decodeAudioData:
            typeof audioContextCtor === "function"
                ? (audioContextCtor as { prototype?: { decodeAudioData?: unknown } })
                      .prototype?.decodeAudioData
                : undefined,
        geolocation: win.navigator?.geolocation,
        deviceOrientationEvent: orientation,
        orientationRequestPermission: orientation?.requestPermission,
    };
}

export function runPreflight(env: PreflightEnv): Preflight {
    const hasAudio = typeof env.audioContextCtor === "function";

    const checks: CapabilityCheck[] = [
        {
            id: "phone",
            label: capabilityCopy.phone.label,
            available: env.isPhone,
            // Not essential in the sense that matters here: a desktop browser
            // can open the map and the mocked replays run there on purpose.
            // It is still not the piece.
            essential: false,
            detail: capabilityCopy.phone.detail,
        },
        {
            id: "browser",
            label: capabilityCopy.browser.label,
            available: env.webviewHost === null,
            // Not essential, because it is a guess and because some webviews
            // do play sound. Saying "the walk will not work" on a guess would
            // send someone home who could have walked it.
            essential: false,
            detail: capabilityCopy.browser.detail,
        },
        {
            id: "audio",
            label: capabilityCopy.audio.label,
            available: hasAudio,
            essential: true,
            detail: capabilityCopy.audio.detail,
        },
        {
            id: "decode",
            label: capabilityCopy.decode.label,
            // Only meaningful when there is an AudioContext to hang it off;
            // otherwise the audio check above already says the same thing and
            // two lines saying it is worse than one.
            available: !hasAudio || typeof env.decodeAudioData === "function",
            essential: true,
            detail: capabilityCopy.decode.detail,
        },
        {
            id: "geolocation",
            label: capabilityCopy.geolocation.label,
            available: Boolean(env.geolocation),
            essential: true,
            detail: capabilityCopy.geolocation.detail,
        },
        {
            id: "orientation",
            label: capabilityCopy.orientation.label,
            available: Boolean(env.deviceOrientationEvent),
            essential: false,
            detail: capabilityCopy.orientation.detail,
        },
    ];

    const problems = checks.filter((check) => !check.available);
    const verdict: PreflightVerdict = problems.some((check) => check.essential)
        ? "blocked"
        : problems.length > 0
            ? "partial"
            : "ok";

    return {
        checks,
        verdict,
        problems,
        orientationNeedsPermission: typeof env.orientationRequestPermission === "function",
        webviewHost: env.webviewHost,
    };
}
