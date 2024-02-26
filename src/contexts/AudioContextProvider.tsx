import React, { createContext, useState, useEffect, useContext } from 'react';
import { ResonanceAudio } from "resonance-audio";

// Creating the context with an extended initial value
const AudioContextState = createContext({
    audioContext: null,
    resonanceAudioScene: null, // Add the ResonanceAudio scene to the context
    playSound: () => { },
    stopSound: () => { },
});

const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState(null);

    useEffect(() => {
        const initAudio = async () => {
            try {
                // Initialize AudioContext when the component mounts
                const context = new (window.AudioContext || window.webkitAudioContext)();
                setAudioContext(context);

                // Initialize ResonanceAudio scene
                const scene = new ResonanceAudio(context);
                setResonanceAudioScene(scene);
                console.log(scene, context);
            } catch (error) {
                console.error('Error initializing audio:', error);
            }
        };

        initAudio();

        // Clean up when the component unmounts
        return () => {
            if (audioContext) {
                audioContext.close();
            }
        };
    }, []);

    return (
        <AudioContextState.Provider value={{ audioContext, resonanceAudioScene }}>
            {children}
        </AudioContextState.Provider>
    );
};

export default AudioContextProvider;

// Custom hook for consuming context
export const useAudioContext = () => useContext(AudioContextState);
