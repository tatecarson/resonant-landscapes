import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { ResonanceAudio } from "resonance-audio";
import Omnitone from 'omnitone/build/omnitone.min.esm.js';

// Creating the context with an extended initial value
const AudioContextState = createContext({
    audioContext: null,
    resonanceAudioScene: null, // Add the ResonanceAudio scene to the context
    playSound: (buffer) => { },
    stopSound: () => { },
    isLoading: false,
    setIsLoading: (boolean) => { },
    isPlaying: false,
    setIsPlaying: (boolean) => { },
    buffers: [],
    loadBuffers: (urls) => { },
    setBuffers: (buffers) => { },
    bufferSourceRef: null,
    loadError: null,
    clearLoadError: () => { }
});


const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState(null);
    const [buffers, setBuffers] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const bufferSourceRef = useRef(null);
    const lastAudioEventRef = useRef<string | null>(null);

    const syncAudioDebug = (nextEvent?: string | null) => {
        if (nextEvent !== undefined) {
            lastAudioEventRef.current = nextEvent;
        }

        const audioBuffer = buffers && typeof buffers === 'object' && 'duration' in buffers ? buffers : null;

        window.__audioDebug = {
            contextState: audioContext?.state ?? 'unavailable',
            isLoading,
            isPlaying,
            hasBuffers: Boolean(audioBuffer),
            bufferDuration: audioBuffer?.duration ?? null,
            bufferChannels: audioBuffer?.numberOfChannels ?? null,
            hasSourceNode: Boolean(bufferSourceRef.current),
            loadError,
            lastEvent: lastAudioEventRef.current,
        };
    };

    const loadBuffers = async (urls) => {
        if (!audioContext || !resonanceAudioScene || !urls.length) {
            console.error("Missing audio context, resonance scene, or URLs.");
            setLoadError("Missing audio context, resonance scene, or URLs.");
            syncAudioDebug("load-missing-prereqs");
            return false;
        }

        setIsLoading(true);
        setLoadError(null);
        syncAudioDebug("load-start");

        try {
            const results = await Omnitone.createBufferList(audioContext, urls);
            console.log("Results", results);
            const contentBuffer = Omnitone.mergeBufferListByChannel(audioContext, results);
            setBuffers(contentBuffer);
            lastAudioEventRef.current = "buffers-loaded";
            return true;
        } catch (error) {
            console.error("Error loading buffers with Omnitone:", error);
            setLoadError(error instanceof Error ? error.message : String(error));
            setBuffers([]);
            lastAudioEventRef.current = "load-error";
            return false;
        } finally {
            setIsLoading(false);
        }
    };



    // Function to play sound
    // const playSound = () => {
    //     if (!audioContext || !resonanceAudioScene || isPlaying) return;

    //     console.log('Playing sound...', buffers);
    //     const source = resonanceAudioScene.createSource();
    //     const bufferSource = audioContext.createBufferSource();
    //     bufferSourceRef.current = bufferSource;
    //     bufferSource.buffer = buffers;
    //     bufferSource.loop = true;
    //     bufferSource.connect(source.input);
    //     bufferSource.start();
    //     setIsPlaying(true);
    // };


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

    // Function to stop sound
    const stopSound = () => {
        if (bufferSourceRef.current && isPlaying) {
            console.log('Stopping sound...');
            bufferSourceRef.current.stop();
            // bufferSourceRef.current.buffer = null;
            bufferSourceRef.current.disconnect()
            bufferSourceRef.current = null;
            setIsPlaying(false);
            syncAudioDebug("playback-stopped");
        }
    };

    // Cleanup method to free up buffer memory
    const cleanupBuffers = () => {
        if (buffers.length > 0) {
            // Assuming buffers is an array of AudioBuffer or similar
            setBuffers([]); // Clearing the buffers array
        }
        // Additional cleanup logic if needed
    };

    useEffect(() => {
        const initAudio = async () => {
            try {
                const context = new (window.AudioContext || window.webkitAudioContext)();
                setAudioContext(context);
                const scene = new ResonanceAudio(context);
                scene.setAmbisonicOrder(2)
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
