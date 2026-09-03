/**
 * The `window.__audioDebug` mirror the Playwright specs read.
 *
 * This was ~60 lines inside the provider with the event names as bare
 * strings, written in two different ways: `syncAudioDebug("load-start")` in
 * some places and `lastAudioEventRef.current = "buffers-loaded"` in others.
 * Nothing checked either. A typo in the provider or in a spec's poll produced
 * a mirror that simply never reached the state being waited on, and the
 * failure looked like a slow download rather than a misspelling.
 *
 * The event union below is the fix: every name a spec can poll for is spelled
 * once, and a typo is a compile error.
 */

import { isDebugEnabled } from "../config/debug";
/**
 * Every event the audio engine reports. Ordered by when they happen in a
 * walk: engine start-up, loading, playback, unlocking, interruption.
 */
export type AudioEvent =
    | "audio-initialized"
    | "audio-init-error"
    | "load-start"
    | "buffers-loaded"
    | "load-error"
    | "load-cancelled"
    | "load-stale-ignored"
    | "prefetch-complete"
    | "prefetch-aborted"
    | "prefetch-error"
    | "playback-started"
    | "playback-stopped"
    | "playback-ended"
    | "play-ignored"
    | "play-no-buffers"
    | "resume-requested"
    | "context-resumed"
    | "resume-error"
    | "audio-unlocked"
    | "unlock-error"
    | "interruption-resume-requested"
    | "interruption-resumed"
    | "interruption-resume-blocked"
    | "context-state-changed";

export type AudioLoadDebug = {
    urls: string[];
    reason: "active-load" | "prefetch";
    startedAt: number;
    completedAt: number | null;
    durationMs: number | null;
    cacheHit: boolean;
};

/** The provider-owned state the mirror is derived from. */
export interface AudioDebugSnapshot {
    audioContextState: string;
    isEngineInitializing: boolean;
    isLoading: boolean;
    isPlaying: boolean;
    isAudioUnlocked: boolean;
    buffers: AudioBuffer | null;
    engineError: string | null;
    loadError: string | null;
    lastUnlockError: string | null;
    needsAudioResume: boolean;
    activeUrls: string[];
    lastLoad: AudioLoadDebug | null;
}

/** What actually lands on `window.__audioDebug`. */
export type AudioDebugMirror = NonNullable<Window["__audioDebug"]>;

interface AudioDebugBridgeOptions {
    /** Live, because the node is replaced on every playback. */
    getSourceNode: () => AudioBufferSourceNode | null;
    getCacheSize: () => number;
    /**
     * Seams for tests. In the app these read and write the real window, and
     * `isEnabled` is the same debug gate the rest of the app uses.
     */
    isEnabled?: () => boolean;
    readUiStatus?: () => string | null;
    publish?: (mirror: AudioDebugMirror) => void;
}

export interface AudioDebugBridge {
    /** Record what just happened without republishing the mirror. */
    recordEvent: (event: AudioEvent) => void;
    /** Merge provider state in without republishing. */
    update: (patch: Partial<AudioDebugSnapshot>) => void;
    /**
     * Publish the mirror, optionally recording an event first. Passing `null`
     * clears the event, which is why this takes an optional rather than
     * defaulting.
     */
    sync: (event?: AudioEvent | null) => void;
    getSnapshot: () => AudioDebugSnapshot;
    getLastEvent: () => AudioEvent | null;
}

const INITIAL_SNAPSHOT: AudioDebugSnapshot = {
    audioContextState: "unavailable",
    isEngineInitializing: true,
    isLoading: false,
    isPlaying: false,
    isAudioUnlocked: false,
    buffers: null,
    engineError: null,
    loadError: null,
    lastUnlockError: null,
    needsAudioResume: false,
    activeUrls: [],
    lastLoad: null,
};

export function createAudioDebugBridge({
    getSourceNode,
    getCacheSize,
    isEnabled = isDebugEnabled,
    readUiStatus = () => window.__audioDebug?.uiStatus ?? null,
    publish = (mirror) => {
        window.__audioDebug = mirror;
    },
}: AudioDebugBridgeOptions): AudioDebugBridge {
    let snapshot: AudioDebugSnapshot = { ...INITIAL_SNAPSHOT };
    let lastEvent: AudioEvent | null = null;

    const recordEvent = (event: AudioEvent) => {
        lastEvent = event;
    };

    const update = (patch: Partial<AudioDebugSnapshot>) => {
        snapshot = { ...snapshot, ...patch };
    };

    const sync = (event?: AudioEvent | null) => {
        if (event !== undefined) {
            lastEvent = event;
        }
        // The event is recorded either way. Only the mirror is gated, so a
        // production build stops writing an object nobody reads without also
        // losing track of where playback got to.
        if (!isEnabled()) return;

        // HOARenderer writes uiStatus onto the same object; read it back so
        // publishing here does not erase it.
        const uiStatus = readUiStatus();

        publish({
            contextState: snapshot.audioContextState,
            isEngineInitializing: snapshot.isEngineInitializing,
            isLoading: snapshot.isLoading,
            isPlaying: snapshot.isPlaying,
            isAudioUnlocked: snapshot.isAudioUnlocked,
            hasBuffers: Boolean(snapshot.buffers),
            bufferDuration: snapshot.buffers?.duration ?? null,
            bufferChannels: snapshot.buffers?.numberOfChannels ?? null,
            hasSourceNode: Boolean(getSourceNode()),
            engineError: snapshot.engineError,
            loadError: snapshot.loadError,
            lastUnlockError: snapshot.lastUnlockError,
            needsAudioResume: snapshot.needsAudioResume,
            lastEvent,
            activeUrls: snapshot.activeUrls,
            cacheEntries: getCacheSize(),
            lastLoadReason: snapshot.lastLoad?.reason ?? null,
            lastLoadDurationMs: snapshot.lastLoad?.durationMs ?? null,
            lastLoadCacheHit: snapshot.lastLoad?.cacheHit ?? null,
            uiStatus,
        });
    };

    return {
        recordEvent,
        update,
        sync,
        getSnapshot: () => snapshot,
        getLastEvent: () => lastEvent,
    };
}
