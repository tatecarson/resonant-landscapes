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
    setIsLoading: (boolean) => { },
    isPlaying: false,
    buffers: []
});


const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState(null);
    const [buffers, setBuffers] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const bufferSourceRef = useRef(null);

    const loadBuffers = async (urls) => {
        console.log(audioContext, resonanceAudioScene);
        if (!audioContext || !resonanceAudioScene || !urls.length) {
            console.error("Missing audio context, resonance scene, or URLs.");
            return;
        }

        setIsLoading(true);
        try {
            console.log("Loading buffers...");
            const loadedBuffers = await Omnitone.createBufferList(audioContext, urls);
            setBuffers(loadedBuffers);
        } catch (error) {
            console.error('Error loading buffers with Omnitone:', error);
        } finally {
            setIsLoading(false);
        }
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
            playSound, stopSound, loadBuffers, isLoading, setIsLoading, isPlaying, buffers
        }}>
            {children}
        </AudioContextState.Provider>
    );
};

export default AudioContextProvider;

export const useAudioContext = () => useContext(AudioContextState);
