import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { ResonanceAudio } from "resonance-audio";
import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { useRenderDebug } from "../hooks/useRenderDebug";

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
}

interface AudioPlaybackStateContextType {
    isLoading: boolean;
    isPlaying: boolean;
    isAudioUnlocked: boolean;
    buffers: AudioBuffer | null;
    loadError: string | null;
    lastUnlockError: string | null;
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
});

const AudioPlaybackStateContext = createContext<AudioPlaybackStateContextType>({
    isLoading: false,
    isPlaying: false,
    isAudioUnlocked: false,
    buffers: null,
    loadError: null,
    lastUnlockError: null,
});


const AudioContextProvider = ({ children }: { children: React.ReactNode }) => {
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState<ResonanceAudio | null>(null);
    const [buffers, setBuffers] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastUnlockError, setLastUnlockError] = useState<string | null>(null);
    const audioInitializedRef = useRef(false);
    const initAudioPromiseRef = useRef<Promise<void> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const lastAudioEventRef = useRef<string | null>(null);
    const activeLoadRequestIdRef = useRef(0);
    const bufferCacheRef = useRef(new Map<string, AudioBuffer>());
    const pendingBufferLoadsRef = useRef(new Map<string, Promise<AudioBuffer>>());
    const audioDebugStateRef = useRef({
        audioContextState: 'unavailable',
        isLoading: false,
        isPlaying: false,
        isAudioUnlocked: false,
        buffers: null as AudioBuffer | null,
        loadError: null as string | null,
        lastUnlockError: null as string | null,
        activeUrls: [] as string[],
        lastLoad: null as AudioLoadDebug | null,
    });

    const getCacheKey = useCallback((urls: string[]) => urls.join("::"), []);

    const syncAudioDebug = useCallback((nextEvent?: string | null) => {
        if (nextEvent !== undefined) {
            lastAudioEventRef.current = nextEvent;
        }

        const {
            audioContextState,
            isLoading: loading,
            isPlaying: playing,
            isAudioUnlocked: unlocked,
            buffers: activeBuffers,
            loadError: activeLoadError,
            lastUnlockError: activeUnlockError,
            activeUrls,
            lastLoad,
        } = audioDebugStateRef.current;
        window.__audioDebug = {
            contextState: audioContextState,
            isLoading: loading,
            isPlaying: playing,
            isAudioUnlocked: unlocked,
            hasBuffers: Boolean(activeBuffers),
            bufferDuration: activeBuffers?.duration ?? null,
            bufferChannels: activeBuffers?.numberOfChannels ?? null,
            hasSourceNode: Boolean(bufferSourceRef.current),
            loadError: activeLoadError,
            lastUnlockError: activeUnlockError,
            lastEvent: lastAudioEventRef.current,
            activeUrls,
            cacheEntries: bufferCacheRef.current.size,
            lastLoadReason: lastLoad?.reason ?? null,
            lastLoadDurationMs: lastLoad?.durationMs ?? null,
            lastLoadCacheHit: lastLoad?.cacheHit ?? null,
        };
    }, []);

    const recordLoadDebug = useCallback((load: AudioLoadDebug) => {
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
        setIsLoading(false);
        setBuffers(null);
        audioDebugStateRef.current = {
            ...audioDebugStateRef.current,
            activeUrls: [],
        };
        lastAudioEventRef.current = "load-cancelled";
        syncAudioDebug();
    }, [syncAudioDebug]);

    const ensureBuffers = useCallback(async (
        urls: string[],
        reason: "active-load" | "prefetch"
    ): Promise<AudioBuffer> => {
        if (!audioContext || !resonanceAudioScene || !urls.length) {
            throw new Error("Missing audio context, resonance scene, or URLs.");
        }

        const cacheKey = getCacheKey(urls);
        const cachedBuffer = bufferCacheRef.current.get(cacheKey);
        const startedAt = Date.now();

        if (cachedBuffer) {
            const load = {
                urls,
                reason,
                startedAt,
                completedAt: startedAt,
                durationMs: 0,
                cacheHit: true,
            } satisfies AudioLoadDebug;
            recordLoadDebug(load);
            return cachedBuffer;
        }

        const pendingLoad = pendingBufferLoadsRef.current.get(cacheKey);
        if (pendingLoad) {
            const buffer = await pendingLoad;
            const completedAt = Date.now();
            recordLoadDebug({
                urls,
                reason,
                startedAt,
                completedAt,
                durationMs: completedAt - startedAt,
                cacheHit: true,
            });
            return buffer;
        }

        const request = Omnitone.createBufferList(audioContext, urls)
            .then((results) => {
                const contentBuffer = Omnitone.mergeBufferListByChannel(audioContext, results);
                bufferCacheRef.current.set(cacheKey, contentBuffer);
                return contentBuffer;
            })
            .finally(() => {
                pendingBufferLoadsRef.current.delete(cacheKey);
            });

        pendingBufferLoadsRef.current.set(cacheKey, request);
        const buffer = await request;
        const completedAt = Date.now();
        recordLoadDebug({
            urls,
            reason,
            startedAt,
            completedAt,
            durationMs: completedAt - startedAt,
            cacheHit: false,
        });
        return buffer;
    }, [audioContext, getCacheKey, recordLoadDebug, resonanceAudioScene]);

    const loadBuffers = useCallback(async (urls: string[]): Promise<boolean> => {
        const requestId = ++activeLoadRequestIdRef.current;
        setIsLoading(true);
        setLoadError(null);
        setBuffers(null);
        syncAudioDebug("load-start");

        try {
            const contentBuffer = await ensureBuffers(urls, "active-load");
            if (requestId !== activeLoadRequestIdRef.current) {
                lastAudioEventRef.current = "load-stale-ignored";
                return false;
            }

            setBuffers(contentBuffer);
            lastAudioEventRef.current = "buffers-loaded";
            return true;
        } catch (error) {
            if (requestId !== activeLoadRequestIdRef.current) {
                lastAudioEventRef.current = "load-stale-ignored";
                return false;
            }
            console.error("Error loading buffers with Omnitone:", error);
            setLoadError(error instanceof Error ? error.message : String(error));
            setBuffers(null);
            lastAudioEventRef.current = "load-error";
            return false;
        } finally {
            if (requestId === activeLoadRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [ensureBuffers, syncAudioDebug]);

    const preloadBuffers = useCallback(async (urls: string[]): Promise<boolean> => {
        try {
            await ensureBuffers(urls, "prefetch");
            syncAudioDebug("prefetch-complete");
            return true;
        } catch (error) {
            console.error("Error preloading buffers with Omnitone:", error);
            syncAudioDebug("prefetch-error");
            return false;
        }
    }, [ensureBuffers, syncAudioDebug]);

    const proceedWithPlayback = useCallback(() => {
        if (!audioContext || !resonanceAudioScene || !buffers) return;

        console.log('Playing sound...', buffers);
        const source = resonanceAudioScene.createSource();
        const bufferSource = audioContext.createBufferSource();
        bufferSourceRef.current = bufferSource;
        bufferSource.buffer = buffers;
        bufferSource.loop = true;
        bufferSource.connect(source.input);
        bufferSource.onended = () => {
            bufferSourceRef.current = null;
            setIsPlaying(false);
            syncAudioDebug("playback-ended");
        };
        bufferSource.start();
        setIsPlaying(true);
        syncAudioDebug("playback-started");
    }, [audioContext, buffers, resonanceAudioScene, syncAudioDebug]);

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
    }, [syncAudioDebug]);

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
                console.log('Audio context resumed.');
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
            console.log('Stopping sound...');
            bufferSourceRef.current.stop();
            bufferSourceRef.current.disconnect();
            bufferSourceRef.current = null;
            setIsPlaying(false);
            syncAudioDebug("playback-stopped");
        }
    }, [isPlaying, syncAudioDebug]);

    useEffect(() => {
        if (audioInitializedRef.current) return;
        audioInitializedRef.current = true;

        initAudioPromiseRef.current = (async () => {
            try {
                const AudioContextCtor = window.AudioContext
                    ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (!AudioContextCtor) {
                    throw new Error('AudioContext is not supported in this browser.');
                }
                const context = new AudioContextCtor();
                audioContextRef.current = context;
                setAudioContext(context);
                const scene = new ResonanceAudio(context);
                scene.setAmbisonicOrder(2);
                setResonanceAudioScene(scene);
                scene.output.connect(context.destination);
                lastAudioEventRef.current = "audio-initialized";
            } catch (error) {
                console.error('Error initializing audio:', error);
                lastAudioEventRef.current = "audio-init-error";
            }
        })();
    }, []);

    useEffect(() => {
        audioDebugStateRef.current = {
            audioContextState: audioContext?.state ?? 'unavailable',
            isLoading,
            isPlaying,
            isAudioUnlocked,
            buffers,
            loadError,
            lastUnlockError,
            activeUrls: audioDebugStateRef.current.activeUrls,
            lastLoad: audioDebugStateRef.current.lastLoad,
        };
        syncAudioDebug();
    }, [audioContext, buffers, isLoading, isPlaying, isAudioUnlocked, loadError, lastUnlockError, syncAudioDebug]);


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
    ]);

    const playbackStateValue = useMemo(() => ({
        isLoading,
        isPlaying,
        isAudioUnlocked,
        buffers,
        loadError,
        lastUnlockError,
    }), [isLoading, isPlaying, isAudioUnlocked, buffers, loadError, lastUnlockError]);

    useRenderDebug("AudioContextProvider", {
        audioContextState: audioContext?.state ?? "unavailable",
        hasResonanceScene: Boolean(resonanceAudioScene),
        isLoading,
        isPlaying,
        isAudioUnlocked,
        hasBuffers: Boolean(buffers),
        loadError,
        lastUnlockError,
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
