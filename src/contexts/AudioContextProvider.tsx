import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { ResonanceAudio } from "resonance-audio";


// TODO: add other audio capabilities to this so that they're not reredering 
// in the other component 
// Creating the context with an extended initial value
const AudioContextState = createContext({
    audioContext: null,
    resonanceAudioScene: null, // Add the ResonanceAudio scene to the context
    playSound: (buffer) => { },
    stopSound: () => { },
});



const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const bufferSourceRef = useRef(null);

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
            // Assuming `sourceRef.current` points to a BufferSource
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
        <AudioContextState.Provider value={{ audioContext, resonanceAudioScene, playSound, stopSound }}>
            {children}
        </AudioContextState.Provider>
    );
};

export default AudioContextProvider;

// Custom hook for consuming context
export const useAudioContext = () => useContext(AudioContextState);
