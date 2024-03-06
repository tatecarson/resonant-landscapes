import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { ResonanceAudio } from "resonance-audio";
import Omnitone from 'omnitone/build/omnitone.min.esm.js';

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
    buffers: [],
    setBuffers: (buffers) => { },
});


const AudioContextProvider = ({ children }) => {
    const [audioContext, setAudioContext] = useState(null);
    const [resonanceAudioScene, setResonanceAudioScene] = useState(null);
    const [buffers, setBuffers] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const bufferSourceRef = useRef(null);

    const loadBuffers = async (urls) => {
        if (!audioContext || !resonanceAudioScene || !urls.length) {
            console.error("Missing audio context, resonance scene, or URLs.");
            return;
        }

        setIsLoading(true);



        Omnitone.createBufferList(audioContext, urls)
            .then((results) => {

                console.log("Results", results)
                const contentBuffer = Omnitone.mergeBufferListByChannel(audioContext, results); // Adjust if needed
                console.log(contentBuffer)
                setBuffers(contentBuffer); // Ensure buffers is set with the correct format, wrapped in an array if necessary
                setIsLoading(false); // Update loading state
            })
            .catch((error) => {
                console.error("Error loading buffers with Omnitone:", error);
                // setLoadError(error); // Update state to reflect loading error
                setIsLoading(false); // Ensure loading state is updated even in case of error
            });
    };



    // Function to play sound
    const playSound = () => {
        if (!audioContext || !resonanceAudioScene || isPlaying) return;

        console.log('Playing sound...', buffers);
        const source = resonanceAudioScene.createSource();
        const bufferSource = audioContext.createBufferSource();
        bufferSourceRef.current = bufferSource;
        bufferSource.buffer = buffers;
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
            bufferSourceRef.current.disconnect()
            setIsPlaying(false);
        }
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

            } catch (error) {

                console.error('Error initializing audio:', error);
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
        };
    }, []);


    return (
        <AudioContextState.Provider value={{
            audioContext, resonanceAudioScene,
            playSound, stopSound, loadBuffers, isLoading, setIsLoading, isPlaying, buffers, setBuffers
        }}>
            {children}
        </AudioContextState.Provider>
    );
};

export default AudioContextProvider;

export const useAudioContext = () => useContext(AudioContextState);
