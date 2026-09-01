type AudioSessionType =
    | "auto"
    | "playback"
    | "transient"
    | "transient-solo"
    | "ambient"
    | "play-and-record";

type NavigatorWithAudioSession = Navigator & {
    audioSession?: {
        type: AudioSessionType;
    };
};

/**
 * Tell Safari that this walk is deliberate media playback.
 *
 * Web Audio defaults to an ambient session on iOS, so silent mode mutes it.
 * Safari 17 and later expose the Audio Session API, where `playback` follows
 * the same policy as ordinary music and video. Older browsers simply keep
 * their existing behavior.
 */
export function declarePlaybackAudioSession(nav: Navigator): boolean {
    const session = (nav as NavigatorWithAudioSession).audioSession;
    if (!session) {
        return false;
    }

    try {
        session.type = "playback";
        return session.type === "playback";
    } catch {
        // Experimental or policy-disabled implementations have thrown from
        // the setter. Audio still works there, subject to the old mute rules.
        return false;
    }
}
