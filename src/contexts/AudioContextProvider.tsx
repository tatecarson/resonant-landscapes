import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
// Type-only: the library itself is dynamically imported in the init effect
// below so its ~300 kB (its own bundled Omnitone and base64 HRIR tables
// included) stays out of the chunk the first paint waits on.
import type { ResonanceAudio } from "resonance-audio";
import { useRenderDebug } from "../hooks/useRenderDebug";
import { usePlaybackWakeLock } from "../hooks/usePlaybackWakeLock";
import { createBufferCache } from "../audio/bufferCache";
import { createBufferLoader, getCacheKey, isAbortError } from "../audio/bufferLoader";
import { shouldSurfaceDegradation, type SpatialDegradation } from "../audio/channelCheck";
import { mergeBuffersByChannel } from "../audio/mergeBuffers";
import { debugLog, isDebugEnabled } from "../config/debug";

// Active park plus one prefetch. Each merged park buffer is 9 channels of
// float PCM (~100 MB per minute), so this cap is what keeps a full walk from
// exhausting mobile Safari.
const MAX_CACHED_PARKS = 2;
// Long enough to remove the click, short enough that crossing the boundary
// still feels like the park starting and stopping rather than a slow dissolve.
const FADE_SECONDS = 0.3;
const KEEP_SCREEN_AWAKE_STORAGE_KEY = "keepScreenAwakeDuringPlayback";

interface AudioEngineContextType {
    audioContext: AudioContext | null;
    resonanceAudioScene: ResonanceAudio | null;
    unlockAudio: () => Promise<boolean>;
    playSound: () => void;
    stopSound: () => void;
    loadBuffers: (urls: string[]) => Promise<boolean>;
    bufferSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>;
    clearLoadError: () => void;
    cancelPendingLoad: () => void;
    preloadBuffers: (urls: string[]) => Promise<boolean>;
    resumeInterruptedAudio: () => Promise<boolean>;
    setKeepScreenAwake: (enabled: boolean) => void;
}

interface AudioPlaybackStateContextType {
    isEngineInitializing: boolean;
    isLoading: boolean;
    isPlaying: boolean;
    isAudioUnlocked: boolean;
    buffers: AudioBuffer | null;
    engineError: string | null;
    loadError: string | null;
    lastUnlockError: string | null;
    /**
     * Set once the browser is caught downmixing the 8-channel spatial file.
     * Sticky by design: a browser that collapses one park collapses them all,
     * and the UI note should not flicker off on the next cache hit.
     */
    spatialDegradation: SpatialDegradation | null;
    lastLoadReason: "active-load" | "prefetch" | null;
    lastLoadCacheHit: boolean | null;
    lastLoadDurationMs: number | null;
    needsAudioResume: boolean;
    keepScreenAwake: boolean;
    wakeLockSupported: boolean;
    wakeLockStatus: "inactive" | "requesting" | "active" | "error";
    wakeLockError: string | null;
}

type AudioLoadDebug = {
    urls: string[];
    reason: "active-load" | "prefetch";
    startedAt: number;
    completedAt: number | null;
    durationMs: number | null;
    cacheHit: boolean;
};

const AudioEngineContext = createContext<AudioEngineContextType>({
    audioContext: null,
    resonanceAudioScene: null,
    unlockAudio: async () => false,
    playSound: () => {},
    stopSound: () => {},
    loadBuffers: async () => false,
    bufferSourceRef: { current: null },
    clearLoadError: () => {},
    cancelPendingLoad: () => {},
    preloadBuffers: async () => false,
    resumeInterruptedAudio: async () => false,
    setKeepScreenAwake: () => {},
});

const AudioPlaybackStateContext = createContext<AudioPlaybackStateContextType>({
    isEngineInitializing: true,
    isLoading: false,
    isPlaying: false,
    isAudioUnlocked: false,
    buffers: null,
    engineError: null,
    loadError: null,
    lastUnlockError: null,
    spatialDegradation: null,
    lastLoadReason: null,
    lastLoadCacheHit: null,
    lastLoadDurationMs: null,
    needsAudioResume: false,
    keepScreenAwake: true,
    wakeLockSupported: false,
    wakeLockStatus: "inactive",
    wakeLockError: null,
});


const AudioContextProvider = ({ children }: { children: React.ReactNode }) => {
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState<ResonanceAudio | null>(null);
    const [buffers, setBuffers] = useState<AudioBuffer | null>(null);
    const [isEngineInitializing, setIsEngineInitializing] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const [engineError, setEngineError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastUnlockError, setLastUnlockError] = useState<string | null>(null);
    const [spatialDegradation, setSpatialDegradation] = useState<SpatialDegradation | null>(null);
    const [lastLoad, setLastLoad] = useState<AudioLoadDebug | null>(null);
    const [needsAudioResume, setNeedsAudioResume] = useState(false);
    const [keepScreenAwake, setKeepScreenAwakeState] = useState(() => {
        try {
            return window.localStorage.getItem(KEEP_SCREEN_AWAKE_STORAGE_KEY) !== "false";
        } catch {
            return true;
        }
    });
    const audioInitializedRef = useRef(false);
    const initAudioPromiseRef = useRef<Promise<void> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const resonanceSceneRef = useRef<ResonanceAudio | null>(null);
    const audioPrimedRef = useRef(false);
    const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const fadeGainRef = useRef<GainNode | null>(null);
    const isPlayingRef = useRef(false);
    const lastAudioEventRef = useRef<string | null>(null);
    const activeLoadRequestIdRef = useRef(0);
    const bufferCacheRef = useRef(createBufferCache({ maxEntries: MAX_CACHED_PARKS }));
    // Key of the buffer currently pinned for playback, and the keys of the
    // in-flight active/prefetch loads, so each can be aborted independently.
    const pinnedKeyRef = useRef<string | null>(null);
    const activeLoadUrlsRef = useRef<string[] | null>(null);
    const prefetchUrlsRef = useRef<string[] | null>(null);
    const audioDebugStateRef = useRef({
        audioContextState: 'unavailable',
        isEngineInitializing: true,
        isLoading: false,
        isPlaying: false,
        isAudioUnlocked: false,
        buffers: null as AudioBuffer | null,
        engineError: null as string | null,
        loadError: null as string | null,
        lastUnlockError: null as string | null,
        needsAudioResume: false,
        activeUrls: [] as string[],
        lastLoad: null as AudioLoadDebug | null,
    });

    const bufferLoaderRef = useRef<ReturnType<typeof createBufferLoader> | null>(null);
    const {
        supported: wakeLockSupported,
        status: wakeLockStatus,
        error: wakeLockError,
    } = usePlaybackWakeLock(keepScreenAwake && isPlaying);

    const getBufferLoader = useCallback(() => {
        if (bufferLoaderRef.current) return bufferLoaderRef.current;

        bufferLoaderRef.current = createBufferLoader({
            cache: bufferCacheRef.current,
            fetchArrayBuffer: async (url, signal) => {
                const response = await fetch(url, { signal });
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url} (${response.status})`);
                }
                return response.arrayBuffer();
            },
            decode: (data) => {
                const context = audioContextRef.current;
                if (!context) throw new Error("Audio context is not ready yet.");
                // Older Safari only implements the callback form of
                // decodeAudioData; Omnitone's loader used to paper over this.
                return new Promise<AudioBuffer>((resolve, reject) => {
                    const maybePromise = context.decodeAudioData(data, resolve, reject);
                    if (maybePromise && typeof maybePromise.then === "function") {
                        maybePromise.then(resolve, reject);
                    }
                });
            },
            merge: (decoded) => {
                const context = audioContextRef.current;
                if (!context) throw new Error("Audio context is not ready yet.");
                return mergeBuffersByChannel(context, decoded);
            },
            onSpatialDegraded: (degradation, cacheKey) => {
                const activeKey = activeLoadUrlsRef.current
                    ? getCacheKey(activeLoadUrlsRef.current)
                    : null;
                if (!shouldSurfaceDegradation(degradation, cacheKey, activeKey)) return;
                setSpatialDegradation(degradation);
            },
        });

        return bufferLoaderRef.current;
    }, []);

    /**
     * Pin the buffer that is about to play so eviction can never drop it out
     * from under a live AudioBufferSourceNode, and release the previous one.
     */
    const pinActiveBuffer = useCallback((key: string | null) => {
        if (pinnedKeyRef.current === key) return;
        if (pinnedKeyRef.current) {
            bufferCacheRef.current.unpin(pinnedKeyRef.current);
        }
        pinnedKeyRef.current = key;
        if (key) {
            bufferCacheRef.current.pin(key);
        }
    }, []);

    const syncAudioDebug = useCallback((nextEvent?: string | null) => {
        if (nextEvent !== undefined) {
            lastAudioEventRef.current = nextEvent;
        }
        const uiStatus = window.__audioDebug?.uiStatus ?? null;

        const {
            audioContextState,
            isEngineInitializing,
            isLoading: loading,
            isPlaying: playing,
            isAudioUnlocked: unlocked,
            buffers: activeBuffers,
            engineError: activeEngineError,
            loadError: activeLoadError,
            lastUnlockError: activeUnlockError,
            needsAudioResume: activeNeedsAudioResume,
            activeUrls,
            lastLoad,
        } = audioDebugStateRef.current;
        if (!isDebugEnabled()) {
            return;
        }

        window.__audioDebug = {
            contextState: audioContextState,
            isEngineInitializing,
            isLoading: loading,
            isPlaying: playing,
            isAudioUnlocked: unlocked,
            hasBuffers: Boolean(activeBuffers),
            bufferDuration: activeBuffers?.duration ?? null,
            bufferChannels: activeBuffers?.numberOfChannels ?? null,
            hasSourceNode: Boolean(bufferSourceRef.current),
            engineError: activeEngineError,
            loadError: activeLoadError,
            lastUnlockError: activeUnlockError,
            needsAudioResume: activeNeedsAudioResume,
            lastEvent: lastAudioEventRef.current,
            activeUrls,
            cacheEntries: bufferCacheRef.current.size,
            lastLoadReason: lastLoad?.reason ?? null,
            lastLoadDurationMs: lastLoad?.durationMs ?? null,
            lastLoadCacheHit: lastLoad?.cacheHit ?? null,
            uiStatus,
        };
    }, []);

    const recordLoadDebug = useCallback((load: AudioLoadDebug) => {
        setLastLoad(load);
        audioDebugStateRef.current = {
            ...audioDebugStateRef.current,
            activeUrls: load.urls,
            lastLoad: load,
        };
    }, []);

    const clearLoadError = useCallback(() => {
        setLoadError(null);
    }, []);

    const cancelPendingLoad = useCallback(() => {
        activeLoadRequestIdRef.current += 1;
        // Stop the bytes, not just the bookkeeping: an abandoned park download
        // otherwise keeps competing for bandwidth with the one being entered.
        if (activeLoadUrlsRef.current) {
            getBufferLoader().abort(activeLoadUrlsRef.current);
            activeLoadUrlsRef.current = null;
        }
        // The park is being left, so its buffer no longer needs protecting.
        pinActiveBuffer(null);
        setIsLoading(false);
        setBuffers(null);
        setLastLoad(null);
        audioDebugStateRef.current = {
            ...audioDebugStateRef.current,
            activeUrls: [],
            lastLoad: null,
        };
        lastAudioEventRef.current = "load-cancelled";
        syncAudioDebug();
    }, [getBufferLoader, pinActiveBuffer, syncAudioDebug]);

    const ensureBuffers = useCallback(async (
        urls: string[],
        reason: "active-load" | "prefetch"
    ): Promise<AudioBuffer> => {
        const context = audioContextRef.current;
        const scene = resonanceSceneRef.current;

        if (!context || !scene || !urls.length) {
            throw new Error("Missing audio context, resonance scene, or URLs.");
        }

        const loader = getBufferLoader();
        const startedAt = Date.now();
        // Read before loading so the debug mirror can still distinguish a
        // caller that avoided a download from one that started it.
        const alreadyResident = Boolean(bufferCacheRef.current.get(getCacheKey(urls)))
            || loader.isLoading(urls);

        const buffer = await loader.load(urls);
        const completedAt = Date.now();
        recordLoadDebug({
            urls,
            reason,
            startedAt,
            completedAt,
            durationMs: completedAt - startedAt,
            cacheHit: alreadyResident,
        });
        return buffer;
    }, [getBufferLoader, recordLoadDebug]);

    const loadBuffers = useCallback(async (urls: string[]): Promise<boolean> => {
        const requestId = ++activeLoadRequestIdRef.current;
        setIsLoading(true);
        setLoadError(null);
        setBuffers(null);
        syncAudioDebug("load-start");

        try {
            // Claim the key before any await. While this is unset, a prefetch
            // retargeting mid-await sees a stale active key and aborts the
            // download for the park being entered — then this load restarts it
            // from zero, which is the cellular round trip the abort exists to
            // avoid.
            activeLoadUrlsRef.current = urls;
            if (initAudioPromiseRef.current) {
                await initAudioPromiseRef.current;
            }
            const contentBuffer = await ensureBuffers(urls, "active-load");
            if (requestId !== activeLoadRequestIdRef.current) {
                lastAudioEventRef.current = "load-stale-ignored";
                return false;
            }

            // Protect this buffer for as long as it is the active park.
            pinActiveBuffer(getCacheKey(urls));
            setBuffers(contentBuffer);
            lastAudioEventRef.current = "buffers-loaded";
            return true;
        } catch (error) {
            if (requestId !== activeLoadRequestIdRef.current || isAbortError(error)) {
                lastAudioEventRef.current = "load-stale-ignored";
                return false;
            }
            console.error("Error loading buffers:", error);
            setLoadError(error instanceof Error ? error.message : String(error));
            setBuffers(null);
            lastAudioEventRef.current = "load-error";
            return false;
        } finally {
            if (requestId === activeLoadRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [ensureBuffers, pinActiveBuffer, syncAudioDebug]);

    const preloadBuffers = useCallback(async (urls: string[]): Promise<boolean> => {
        const key = getCacheKey(urls);
        // Walking past a cluster of parks retargets the prefetch repeatedly;
        // drop the previous one so it stops consuming cellular bandwidth.
        const previousUrls = prefetchUrlsRef.current;
        const previousKey = previousUrls ? getCacheKey(previousUrls) : null;
        const activeKey = activeLoadUrlsRef.current
            ? getCacheKey(activeLoadUrlsRef.current)
            : null;
        if (previousUrls && previousKey !== key && previousKey !== activeKey) {
            getBufferLoader().abort(previousUrls);
        }
        prefetchUrlsRef.current = urls;

        try {
            if (initAudioPromiseRef.current) {
                await initAudioPromiseRef.current;
            }
            await ensureBuffers(urls, "prefetch");
            syncAudioDebug("prefetch-complete");
            return true;
        } catch (error) {
            if (isAbortError(error)) {
                syncAudioDebug("prefetch-aborted");
                return false;
            }
            console.error("Error preloading buffers:", error);
            syncAudioDebug("prefetch-error");
            return false;
        } finally {
            if (prefetchUrlsRef.current && getCacheKey(prefetchUrlsRef.current) === key) {
                prefetchUrlsRef.current = null;
            }
        }
    }, [ensureBuffers, getBufferLoader, syncAudioDebug]);

    const proceedWithPlayback = useCallback(() => {
        if (!audioContext || !resonanceAudioScene || !buffers) return;

        debugLog('Playing sound...', buffers);
        const source = resonanceAudioScene.createSource();
        // The merged buffer is 9 channels (8ch HOA + 1ch mono). ResonanceAudio's
        // Source.input is a default GainNode (channelInterpretation='speakers'),
        // and the FLAC container labels the 8ch stream as 7.1, which Safari can
        // use to apply a 5.1-style downmix matrix that drops/attenuates channels.
        // Force discrete routing so every channel reaches the encoder intact.
        source.input.channelInterpretation = 'discrete';
        const bufferSource = audioContext.createBufferSource();
        bufferSourceRef.current = bufferSource;
        bufferSource.buffer = buffers;
        bufferSource.loop = true;

        // Starting a buffer at full amplitude puts a step discontinuity into
        // the stream — an audible click. Crossing the exit radius used to call
        // stop() the same way, so GPS jitter at the boundary clicked on every
        // re-trigger. Fade through a dedicated gain node instead.
        const fadeGain = audioContext.createGain();
        fadeGain.gain.setValueAtTime(0, audioContext.currentTime);
        fadeGain.gain.linearRampToValueAtTime(1, audioContext.currentTime + FADE_SECONDS);
        fadeGainRef.current = fadeGain;

        bufferSource.connect(fadeGain);
        fadeGain.connect(source.input);
        bufferSource.onended = () => {
            // Disconnect here rather than in stopSound: tearing the graph down
            // synchronously would cut the fade-out it just scheduled.
            bufferSource.disconnect();
            fadeGain.disconnect();
            if (fadeGainRef.current === fadeGain) {
                fadeGainRef.current = null;
            }
            if (bufferSourceRef.current === bufferSource) {
                bufferSourceRef.current = null;
            }
            isPlayingRef.current = false;
            setIsPlaying(false);
            setNeedsAudioResume(false);
            syncAudioDebug("playback-ended");
        };
        bufferSource.start();
        isPlayingRef.current = true;
        setIsPlaying(true);
        setNeedsAudioResume(false);
        syncAudioDebug("playback-started");
    }, [audioContext, buffers, resonanceAudioScene, syncAudioDebug]);

    const primeAudioContext = useCallback((context: AudioContext) => {
        if (audioPrimedRef.current) {
            return;
        }

        const silentGain = context.createGain();
        silentGain.gain.value = 0;
        silentGain.connect(context.destination);

        const buffer = context.createBuffer(1, 1, context.sampleRate);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(silentGain);
        source.onended = () => {
            source.disconnect();
            silentGain.disconnect();
        };
        source.start(0);
        source.stop(context.currentTime + 0.001);

        audioPrimedRef.current = true;
    }, []);

    const setKeepScreenAwake = useCallback((enabled: boolean) => {
        setKeepScreenAwakeState(enabled);
        try {
            window.localStorage.setItem(KEEP_SCREEN_AWAKE_STORAGE_KEY, String(enabled));
        } catch {
            // Keep the in-memory preference usable when browser storage is blocked.
        }
    }, []);

    const resumeInterruptedAudio = useCallback(async (): Promise<boolean> => {
        const context = audioContextRef.current;
        if (!context || String(context.state) === "closed") {
            setNeedsAudioResume(false);
            return false;
        }

        if (context.state === "running") {
            setNeedsAudioResume(false);
            setIsAudioUnlocked(true);
            return true;
        }

        setNeedsAudioResume(true);
        syncAudioDebug("interruption-resume-requested");
        try {
            await context.resume();
            const resumed = String(context.state) === "running";
            setNeedsAudioResume(!resumed);
            if (resumed) {
                setIsAudioUnlocked(true);
                setLastUnlockError(null);
                syncAudioDebug("interruption-resumed");
            } else {
                syncAudioDebug("interruption-resume-blocked");
            }
            return resumed;
        } catch (error) {
            console.error("Error resuming interrupted audio:", error);
            setNeedsAudioResume(true);
            syncAudioDebug("interruption-resume-blocked");
            return false;
        }
    }, [syncAudioDebug]);

    const unlockAudio = useCallback(async (): Promise<boolean> => {
        try {
            if (initAudioPromiseRef.current) {
                await initAudioPromiseRef.current;
            }

            const context = audioContextRef.current;
            if (!context) {
                throw new Error("Audio context is not ready yet.");
            }

            setLastUnlockError(null);
            if (context.state === 'suspended') {
                syncAudioDebug("resume-requested");
                await context.resume();
            }

            primeAudioContext(context);

            setIsAudioUnlocked(true);
            syncAudioDebug("audio-unlocked");
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Error unlocking audio:', error);
            setIsAudioUnlocked(false);
            setLastUnlockError(message);
            syncAudioDebug("unlock-error");
            return false;
        }
    }, [primeAudioContext, syncAudioDebug]);

    const playSound = useCallback(() => {
        if (!audioContext || !resonanceAudioScene || isPlaying) {
            syncAudioDebug("play-ignored");
            return;
        }
        if (!buffers) {
            console.error("Cannot play: buffers are not loaded.");
            syncAudioDebug("play-no-buffers");
            return;
        }

        if (audioContext.state === 'suspended') {
            syncAudioDebug("resume-requested");
            audioContext.resume().then(() => {
                debugLog('Audio context resumed.');
                setIsAudioUnlocked(true);
                setLastUnlockError(null);
                syncAudioDebug("context-resumed");
                proceedWithPlayback();
            }).catch((error) => {
                console.error('Error resuming AudioContext:', error);
                setLastUnlockError(error instanceof Error ? error.message : String(error));
                syncAudioDebug("resume-error");
            });
        } else {
            setIsAudioUnlocked(true);
            setLastUnlockError(null);
            proceedWithPlayback();
        }
    }, [audioContext, buffers, isPlaying, proceedWithPlayback, resonanceAudioScene, syncAudioDebug]);

    const stopSound = useCallback(() => {
        if (bufferSourceRef.current && isPlaying) {
            debugLog('Stopping sound...');
            const bufferSource = bufferSourceRef.current;
            const fadeGain = fadeGainRef.current;
            const context = audioContextRef.current;

            if (fadeGain && context) {
                const now = context.currentTime;
                // Ramp from wherever the fade-in got to, not from 1 — a walker
                // who crosses back out within the fade would otherwise jump to
                // full volume before fading.
                fadeGain.gain.cancelScheduledValues(now);
                fadeGain.gain.setValueAtTime(fadeGain.gain.value, now);
                fadeGain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
                bufferSource.stop(now + FADE_SECONDS);
            } else {
                bufferSource.stop();
            }

            // The graph is torn down in onended once the tail has played, but
            // the app is out of the park now: report it immediately so the UI
            // and the geolocation loop do not wait on the fade.
            bufferSourceRef.current = null;
            isPlayingRef.current = false;
            setIsPlaying(false);
            setNeedsAudioResume(false);
            syncAudioDebug("playback-stopped");
        }
    }, [isPlaying, syncAudioDebug]);

    useEffect(() => {
        if (audioInitializedRef.current) return;
        audioInitializedRef.current = true;

        initAudioPromiseRef.current = (async () => {
            try {
                setEngineError(null);
                const AudioContextCtor = window.AudioContext
                    ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (!AudioContextCtor) {
                    throw new Error('AudioContext is not supported in this browser.');
                }
                const context = new AudioContextCtor();
                audioContextRef.current = context;
                setAudioContext(context);
                // Resolved during mount, long before the walker can press
                // Start; unlockAudio already awaits this same init promise, so
                // the gesture path is unchanged.
                const { ResonanceAudio } = await import("resonance-audio");
                const scene = new ResonanceAudio(context);
                resonanceSceneRef.current = scene;
                scene.setAmbisonicOrder(2);
                setResonanceAudioScene(scene);
                // Master gain: ~+3 dB bump so park center is perceptibly louder
                // on mobile. The rl-52o limiter downstream catches any peaks
                // this pushes above -1 dBFS.
                const masterGain = context.createGain();
                masterGain.gain.value = 1.413;
                // Safety limiter: catches peaks only so the master-gain bump or
                // an unusually hot park recording can't clip mobile speakers.
                // Field recordings must keep their dynamic range, so this must
                // stay effectively inaudible on the natural signal.
                const limiter = context.createDynamicsCompressor();
                limiter.threshold.value = -1;
                limiter.knee.value = 0;
                limiter.ratio.value = 20;
                limiter.attack.value = 0.005;
                limiter.release.value = 0.15;
                scene.output.connect(masterGain);
                masterGain.connect(limiter);
                limiter.connect(context.destination);
                lastAudioEventRef.current = "audio-initialized";
            } catch (error) {
                console.error('Error initializing audio:', error);
                setEngineError(error instanceof Error ? error.message : String(error));
                lastAudioEventRef.current = "audio-init-error";
            } finally {
                setIsEngineInitializing(false);
            }
        })();
    }, []);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
        if (!isPlaying) {
            setNeedsAudioResume(false);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!audioContext) return;

        const handleContextState = () => {
            const contextState = String(audioContext.state);
            audioDebugStateRef.current = {
                ...audioDebugStateRef.current,
                audioContextState: contextState,
            };
            syncAudioDebug("context-state-changed");

            if (!isPlayingRef.current || contextState === "closed") {
                setNeedsAudioResume(false);
                return;
            }

            if (contextState === "running") {
                setNeedsAudioResume(false);
                return;
            }

            setNeedsAudioResume(true);
            if (document.visibilityState === "visible") {
                void resumeInterruptedAudio();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && isPlayingRef.current) {
                handleContextState();
            }
        };

        audioContext.addEventListener("statechange", handleContextState);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        handleContextState();

        return () => {
            audioContext.removeEventListener("statechange", handleContextState);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [audioContext, resumeInterruptedAudio, syncAudioDebug]);

    useEffect(() => {
        audioDebugStateRef.current = {
            audioContextState: audioContext?.state ?? 'unavailable',
            isEngineInitializing,
            isLoading,
            isPlaying,
            isAudioUnlocked,
            buffers,
            engineError,
            loadError,
            lastUnlockError,
            needsAudioResume,
            activeUrls: audioDebugStateRef.current.activeUrls,
            lastLoad: audioDebugStateRef.current.lastLoad,
        };
        syncAudioDebug();
    }, [audioContext, buffers, engineError, isEngineInitializing, isLoading, isPlaying, isAudioUnlocked, loadError, lastUnlockError, needsAudioResume, syncAudioDebug]);


    const engineValue = useMemo(() => ({
        audioContext,
        resonanceAudioScene,
        unlockAudio,
        playSound,
        stopSound,
        loadBuffers,
        bufferSourceRef,
        clearLoadError,
        cancelPendingLoad,
        preloadBuffers,
        resumeInterruptedAudio,
        setKeepScreenAwake,
    }), [
        audioContext,
        resonanceAudioScene,
        unlockAudio,
        playSound,
        stopSound,
        loadBuffers,
        clearLoadError,
        cancelPendingLoad,
        preloadBuffers,
        resumeInterruptedAudio,
        setKeepScreenAwake,
    ]);

    const playbackStateValue = useMemo(() => ({
        isEngineInitializing,
        isLoading,
        isPlaying,
        isAudioUnlocked,
        buffers,
        engineError,
        loadError,
        lastUnlockError,
        spatialDegradation,
        lastLoadReason: lastLoad?.reason ?? null,
        lastLoadCacheHit: lastLoad?.cacheHit ?? null,
        lastLoadDurationMs: lastLoad?.durationMs ?? null,
        needsAudioResume,
        keepScreenAwake,
        wakeLockSupported,
        wakeLockStatus,
        wakeLockError,
    }), [
        buffers,
        engineError,
        isEngineInitializing,
        isLoading,
        isPlaying,
        isAudioUnlocked,
        loadError,
        lastUnlockError,
        spatialDegradation,
        lastLoad,
        needsAudioResume,
        keepScreenAwake,
        wakeLockSupported,
        wakeLockStatus,
        wakeLockError,
    ]);

    useRenderDebug("AudioContextProvider", {
        audioContextState: audioContext?.state ?? "unavailable",
        hasResonanceScene: Boolean(resonanceAudioScene),
        isEngineInitializing,
        isLoading,
        isPlaying,
        isAudioUnlocked,
        hasBuffers: Boolean(buffers),
        engineError,
        loadError,
        lastUnlockError,
        needsAudioResume,
        keepScreenAwake,
        wakeLockSupported,
        wakeLockStatus,
        wakeLockError,
        cacheEntries: bufferCacheRef.current.size,
    });

    return (
        <AudioEngineContext.Provider value={engineValue}>
            <AudioPlaybackStateContext.Provider value={playbackStateValue}>
                {children}
            </AudioPlaybackStateContext.Provider>
        </AudioEngineContext.Provider>
    );
};

export default AudioContextProvider;

export const useAudioEngine = () => useContext(AudioEngineContext);

export const useAudioPlaybackState = () => useContext(AudioPlaybackStateContext);

export const useAudioContext = () => ({
    ...useAudioEngine(),
    ...useAudioPlaybackState(),
});
