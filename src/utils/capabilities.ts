/**
 * What the walk needs from a browser, checked before the walker sets out.
 *
 * The support matrix in README.md says which browsers are release targets, but
 * a matrix cannot stop someone opening the piece in whatever they have. Until
 * now the only thing that told them was a line in the Help modal — read after
 * a failure, if at all — so an unsupported phone meant driving to a park and
 * discovering it there. This checks the four things the walk actually depends
 * on and lets the welcome screen say plainly what will and will not work.
 *
 * Deliberately feature detection, not user-agent sniffing. Asset selection in
 * audioPaths.ts has to sniff because canPlayType lies about AAC; these four
 * are simple presence checks with no such problem. And what a downmix does to
 * the field cannot be seen from here at all — that is caught after decode by
 * channelCheck.ts, which is why "surround" below is stated as a maybe.
 */

export type CapabilityId = "audio" | "decode" | "geolocation" | "orientation";

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
};

/** The globals the preflight reads, isolated so it can be tested in node. */
export type PreflightEnv = {
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
    navigator?: { geolocation?: unknown };
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

    return {
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
            id: "audio",
            label: "Sound",
            available: hasAudio,
            essential: true,
            detail: "This browser has no Web Audio support, so the walk cannot play anything. Open the link in Safari or Chrome instead.",
        },
        {
            id: "decode",
            label: "Park recordings",
            // Only meaningful when there is an AudioContext to hang it off;
            // otherwise the audio check above already says the same thing and
            // two lines saying it is worse than one.
            available: !hasAudio || typeof env.decodeAudioData === "function",
            essential: true,
            detail: "This browser cannot decode the park recordings. Open the link in Safari or Chrome instead.",
        },
        {
            id: "geolocation",
            label: "Location",
            available: Boolean(env.geolocation),
            essential: true,
            detail: "This browser cannot share your location, so the walk cannot tell which park you are standing in.",
        },
        {
            id: "orientation",
            label: "Turning",
            available: Boolean(env.deviceOrientationEvent),
            essential: false,
            detail: "This device does not report which way it is facing, so turning will not rotate the sound. Everything else works: volume still follows your distance.",
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
    };
}
