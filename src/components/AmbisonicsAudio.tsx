import React, { useState, useEffect, useRef } from 'react';
import * as ambisonics from 'ambisonics';

const AmbisonicAudio = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);
    const [sound, setSound] = useState(null);

    const [irBuffer, setIrBuffer] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSoundPlaying, setIsSoundPlaying] = useState(false);
    const [playButtonDisabled, setPlayButtonDisabled] = useState(true);

    const decoderRef = useRef(null);
    const mirrorRef = useRef(null);
    const rotatorRef = useRef(null);
    const analyserRef = useRef(null);
    const converterF2ARef = useRef(null);

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

    // function to assign sample to the sound buffer for playback (and enable playbutton)
    const assignSample2SoundBuffer = (decodedBuffer) => {
        setSoundBuffer(decodedBuffer);
        setPlayButtonDisabled(false);
    }

    // function to assign sample to the filter buffers for convolution
    const assignSample2Filters = (decodedBuffer) => {
        decoderRef.current.updateFilters(decodedBuffer);
    }

    // Function to handle toggle button click
    const handleToggleClick = () => {
        if (isSoundPlaying) {
            if (sound) {
                sound.stop(0);
            }

            setIsSoundPlaying(false);
        } else {
            const soundSource = audioContext.createBufferSource();
            soundSource.buffer = soundBuffer;
            soundSource.loop = true;
            soundSource.connect(converterF2ARef.current.in);
            soundSource.start(0);

            setSound(soundSource);
            setIsSoundPlaying(true);
        }
    };


    // Initialize audio context and load audio files
    useEffect(() => {
        // Initialize audio context immediately inside useEffect
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(audioContext)

        mirrorRef.current = new ambisonics.sceneMirror(audioContext, 1);
        rotatorRef.current = new ambisonics.sceneRotator(audioContext, 1);
        decoderRef.current = new ambisonics.binDecoder(audioContext, 1);
        analyserRef.current = new ambisonics.intensityAnalyser(audioContext, 1);
        converterF2ARef.current = new ambisonics.converters.wxyz2acn(audioContext);
        const gainOut = audioContext.createGain();

        // Connect audio graph
        converterF2ARef.current.out.connect(mirrorRef.current.in);
        mirrorRef.current.out.connect(rotatorRef.current.in);
        rotatorRef.current.out.connect(decoderRef.current.in);
        rotatorRef.current.out.connect(analyserRef.current.in);
        decoderRef.current.out.connect(gainOut);
        gainOut.connect(audioContext.destination);

        loadAudio(soundUrl, audioContext).then(buffer => assignSample2SoundBuffer(buffer));
        loadAudio(irUrl, audioContext).then(buffer => assignSample2Filters(buffer));
    }, []);


    const resumeAudioContext = async () => {
        if (audioContext && audioContext.state === "suspended") {
            await audioContext.resume();
        }

        console.log(audioContext)
        // ... load audio files or start playback
    };



    // Render
    return (
        <div>
            <button onClick={resumeAudioContext}>Start Audio</button>
            <button onClick={handleToggleClick}>
                {isSoundPlaying ? 'Stop' : 'Play'}
            </button>
        </div>
    );
};

export default AmbisonicAudio;
