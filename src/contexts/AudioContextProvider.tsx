import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { ResonanceAudio } from "resonance-audio";
import Omnitone from 'omnitone/build/omnitone.min.esm.js';

interface AudioEngineContextType {
    audioContext: AudioContext | null;
    resonanceAudioScene: ResonanceAudio | null;
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
    buffers: AudioBuffer | null;
    loadError: string | null;
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
    buffers: null,
    loadError: null,
});


const AudioContextProvider = ({ children }: { children: React.ReactNode }) => {
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState<ResonanceAudio | null>(null);
    const [buffers, setBuffers] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const lastAudioEventRef = useRef<string | null>(null);
    const activeLoadRequestIdRef = useRef(0);
    const bufferCacheRef = useRef(new Map<string, AudioBuffer>());
    const pendingBufferLoadsRef = useRef(new Map<string, Promise<AudioBuffer>>());
    const audioDebugStateRef = useRef({
        audioContextState: 'unavailable',
        isLoading: false,
        isPlaying: false,
        buffers: null as AudioBuffer | null,
        loadError: null as string | null,
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
            buffers: activeBuffers,
            loadError: activeLoadError,
            activeUrls,
            lastLoad,
        } = audioDebugStateRef.current;
        window.__audioDebug = {
            contextState: audioContextState,
            isLoading: loading,
            isPlaying: playing,
            hasBuffers: Boolean(activeBuffers),
            bufferDuration: activeBuffers?.duration ?? null,
            bufferChannels: activeBuffers?.numberOfChannels ?? null,
            hasSourceNode: Boolean(bufferSourceRef.current),
            loadError: activeLoadError,
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
                syncAudioDebug("context-resumed");
                proceedWithPlayback();
            }).catch((error) => {
                console.error('Error resuming AudioContext:', error);
                syncAudioDebug("resume-error");
            });
        } else {
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

    const cleanupBuffers = useCallback(() => {
        if (buffers) {
            setBuffers(null);
        }
    }, [buffers]);

    useEffect(() => {
        const initAudio = async () => {
            try {
                const AudioContextCtor = window.AudioContext
                    ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (!AudioContextCtor) {
                    throw new Error('AudioContext is not supported in this browser.');
                }
                const context = new AudioContextCtor();
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
        };

        initAudio();

        return () => {
            if (audioContext) {
                audioContext.close();
            }
            if (resonanceAudioScene) {
                resonanceAudioScene.dispose();
            }
            cleanupBuffers();
        };

    }, []);

    useEffect(() => {
        audioDebugStateRef.current = {
            audioContextState: audioContext?.state ?? 'unavailable',
            isLoading,
            isPlaying,
            buffers,
            loadError,
            activeUrls: audioDebugStateRef.current.activeUrls,
            lastLoad: audioDebugStateRef.current.lastLoad,
        };
        syncAudioDebug();
    }, [audioContext, buffers, isLoading, isPlaying, loadError, syncAudioDebug]);


    const engineValue = useMemo(() => ({
        audioContext,
        resonanceAudioScene,
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
        buffers,
        loadError,
    }), [isLoading, isPlaying, buffers, loadError]);

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
