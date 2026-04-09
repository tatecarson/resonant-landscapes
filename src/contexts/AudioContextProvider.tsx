import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { ResonanceAudio } from "resonance-audio";
import Omnitone from 'omnitone/build/omnitone.min.esm.js';

interface AudioContextStateType {
    audioContext: AudioContext | null;
    resonanceAudioScene: ResonanceAudio | null;
    playSound: () => void;
    stopSound: () => void;
    isLoading: boolean;
    setIsLoading: (value: boolean) => void;
    isPlaying: boolean;
    setIsPlaying: (value: boolean) => void;
    buffers: AudioBuffer | null;
    loadBuffers: (urls: string[]) => Promise<boolean>;
    setBuffers: (buffers: AudioBuffer | null) => void;
    bufferSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>;
    loadError: string | null;
    clearLoadError: () => void;
}

const AudioContextState = createContext<AudioContextStateType>({
    audioContext: null,
    resonanceAudioScene: null,
    playSound: () => {},
    stopSound: () => {},
    isLoading: false,
    setIsLoading: () => {},
    isPlaying: false,
    setIsPlaying: () => {},
    buffers: null,
    loadBuffers: async () => false,
    setBuffers: () => {},
    bufferSourceRef: { current: null },
    loadError: null,
    clearLoadError: () => {}
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

    const syncAudioDebug = (nextEvent?: string | null) => {
        if (nextEvent !== undefined) {
            lastAudioEventRef.current = nextEvent;
        }

        window.__audioDebug = {
            contextState: audioContext?.state ?? 'unavailable',
            isLoading,
            isPlaying,
            hasBuffers: Boolean(buffers),
            bufferDuration: buffers?.duration ?? null,
            bufferChannels: buffers?.numberOfChannels ?? null,
            hasSourceNode: Boolean(bufferSourceRef.current),
            loadError,
            lastEvent: lastAudioEventRef.current,
        };
    };

    const loadBuffers = async (urls: string[]): Promise<boolean> => {
        if (!audioContext || !resonanceAudioScene || !urls.length) {
            console.error("Missing audio context, resonance scene, or URLs.");
            setLoadError("Missing audio context, resonance scene, or URLs.");
            syncAudioDebug("load-missing-prereqs");
            return false;
        }

        const requestId = ++activeLoadRequestIdRef.current;
        setIsLoading(true);
        setLoadError(null);
        syncAudioDebug("load-start");

        try {
            const results = await Omnitone.createBufferList(audioContext, urls);
            if (requestId !== activeLoadRequestIdRef.current) {
                lastAudioEventRef.current = "load-stale-ignored";
                return false;
            }
            console.log("Results", results);
            const contentBuffer = Omnitone.mergeBufferListByChannel(audioContext, results);
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
    };

    const playSound = () => {
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
    };

    const proceedWithPlayback = () => {
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
    };

    const stopSound = () => {
        if (bufferSourceRef.current && isPlaying) {
            console.log('Stopping sound...');
            bufferSourceRef.current.stop();
            bufferSourceRef.current.disconnect();
            bufferSourceRef.current = null;
            setIsPlaying(false);
            syncAudioDebug("playback-stopped");
        }
    };

    const cleanupBuffers = () => {
        if (buffers) {
            setBuffers(null);
        }
    };

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
        syncAudioDebug();
    }, [audioContext, buffers, isLoading, isPlaying, loadError]);


    return (
        <AudioContextState.Provider value={{
            audioContext, resonanceAudioScene, bufferSourceRef,
            playSound, stopSound, loadBuffers, isLoading, setIsLoading, isPlaying, setIsPlaying, buffers, setBuffers,
            loadError, clearLoadError: () => setLoadError(null)
        }}>
            {children}
        </AudioContextState.Provider>
    );
};

export default AudioContextProvider;

export const useAudioContext = () => useContext(AudioContextState);
