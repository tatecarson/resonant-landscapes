import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { ResonanceAudio } from "resonance-audio";
import Omnitone from 'omnitone/build/omnitone.min.esm.js'; // Ensure Omnitone is imported

// Creating the context with an extended initial value
const AudioContextState = createContext({
    audioContext: null,
    resonanceAudioScene: null, // Add the ResonanceAudio scene to the context
    playSound: (buffer) => { },
    stopSound: () => { },
    loadBuffers: (urls) => { },
    isLoading: false,
    isPlaying: false,
    buffers: []
});


const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState(null);
    const [buffers, setBuffers] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const bufferSourceRef = useRef(null);

    // Function to load buffers    
    const loadBuffers = (urls) => {
        if (!audioContext) return;

        setIsLoading(true);
        // Initialize Omnitone with the audio context
        Omnitone.createBufferList(audioContext, urls).then((loadedBuffers) => {
            setIsLoading(false);
            setBuffers(loadedBuffers);
        }).catch((error) => {
            console.error('Error loading buffers with Omnitone:', error);
        });
    };
    // Function to play sound
    const playSound = (buffer) => {
        if (!audioContext || !resonanceAudioScene || isPlaying) return;

        console.log('Playing sound...');
        const source = resonanceAudioScene.createSource();
        const bufferSource = audioContext.createBufferSource();
        bufferSourceRef.current = bufferSource;
        bufferSource.buffer = buffer;
        bufferSource.loop = true;
        bufferSource.connect(source.input);
        bufferSource.start();
        setIsPlaying(true);
    };

    // Function to stop sound
    const stopSound = () => {
        if (bufferSourceRef.current && isPlaying) {
            console.log('Stopping sound...');
            bufferSourceRef.current.stop();
            setIsPlaying(false);
        }
    };

    useEffect(() => {
        const initAudio = async () => {
            try {
                const context = new (window.AudioContext || window.webkitAudioContext)();
                setAudioContext(context);
                const scene = new ResonanceAudio(context);
                setResonanceAudioScene(scene);
                scene.output.connect(context.destination);
            } catch (error) {
                console.error('Error initializing audio:', error);
            }
        };

        initAudio();

        return () => {
            if (audioContext) {
                audioContext.close();
            }
        };
    }, []);


    return (
        <AudioContextState.Provider value={{
            audioContext, resonanceAudioScene,
            playSound, stopSound, loadBuffers, isLoading, isPlaying, buffers
        }}>
            {children}
        </AudioContextState.Provider>
    );
};

export default AudioContextProvider;

// Custom hook for consuming context
export const useAudioContext = () => useContext(AudioContextState);
