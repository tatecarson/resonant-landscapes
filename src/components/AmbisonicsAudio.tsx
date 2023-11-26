import React, { useState, useEffect, useRef } from 'react';
import * as ambisonics from 'ambisonics';

const AmbisonicAudio = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);
    const [irBuffer, setIrBuffer] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const decoderRef = useRef(null); // Using useRef to keep a persistent reference to the decoder

    // URLs for the sound and IR files
    const soundUrl = "/sounds/BF_rec1.ogg";
    const irUrl = "/IRs/ambisonic2binaural_filters/aalto2016_N1.wav";

    // Function to load audio files
    const loadAudio = async (url, audioContext) => {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error("Error loading audio file:", error);
        }
    };


    // Initialize audio context and load audio files
    useEffect(() => {
        // Initialize audio context immediately inside useEffect
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(audioContext)

        console.log(ambisonics)
        decoderRef.current = new ambisonics.binDecoder(audioContext, 1);
        // Handle state changes of the audio context


        loadAudio(soundUrl, audioContext).then(buffer => setSoundBuffer(buffer));
        loadAudio(irUrl, audioContext).then(buffer => setIrBuffer(buffer));
    }, []);


    const resumeAudioContext = async () => {
        if (audioContext && audioContext.state === "suspended") {
            await audioContext.resume();
        }

        console.log(audioContext)
        // ... load audio files or start playback
    };

    // Function to handle playback
    const togglePlayback = () => {
        // Implementation of playback logic using soundBuffer and irBuffer
        setIsPlaying(!isPlaying);
    };

    // Render
    return (
        <div>
            <button onClick={resumeAudioContext}>Start Audio</button>
            <button onClick={togglePlayback} disabled={!soundBuffer || !irBuffer}>
                {isPlaying ? 'Stop' : 'Play'}
            </button>
        </div>
    );
};

export default AmbisonicAudio;
