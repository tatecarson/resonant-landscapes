import React, { useState, useEffect, useRef } from 'react';
import * as ambisonics from 'ambisonics';

const AmbisonicAudio = () => {
    const [audioContext, setAudioContext] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);
    const [sound, setSound] = useState(null);
    const [isSoundPlaying, setIsSoundPlaying] = useState(false);
    const [sliderValue, setSliderValue] = useState(0);

    const decoderRef = useRef(null);
    const mirrorRef = useRef(null);
    const limiterRef = useRef(null);
    const rotatorRef = useRef(null);
    const analyserRef = useRef(null);

    // URLs for the sound and IR files
    const soundUrl = "/sounds/HOA3_rec4.ogg";
    const irUrl_0 = "IRs/ambisonic2binaural_filters/HOA3_IRC_1008_virtual.wav";
    const irUrl_1 = "IRs/ambisonic2binaural_filters/aalto2016_N3.wav";
    const irUrl_2 = "IRs/ambisonic2binaural_filters/HOA3_BRIRs-medium.wav";

    const maxOrder = 3;
    const orderOut = 3;
    const [playButtonDisabled, setPlayButtonDisabled] = useState(true);

    const assignSample2SoundBuffer = (decodedBuffer: AudioBuffer) => {
        setSoundBuffer(decodedBuffer);
        setPlayButtonDisabled(false);
    }

    // function to assign sample to the filter buffers for convolution
    const assignSample2Filters = (decodedBuffer) => {
        decoderRef.current.updateFilters(decodedBuffer);
        setPlayButtonDisabled(false);
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
            soundSource.connect(rotatorRef.current.in);
            soundSource.start(0);

            setSound(soundSource);
            setIsSoundPlaying(true);
        }
    };


    // Function to handle slider change
    const handleSliderChange = (event) => {
        const value = event.target.value;
        setSliderValue(value);

        if (rotatorRef.current) {
            rotatorRef.current.yaw = -value;
            rotatorRef.current.updateRotMtx();
        }
    };


    // Initialize audio context and load audio files
    useEffect(() => {
        // Initialize audio context immediately inside useEffect
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(audioContext)

        mirrorRef.current = new ambisonics.sceneMirror(audioContext, maxOrder);
        limiterRef.current = new ambisonics.orderLimiter(audioContext, maxOrder, orderOut);
        rotatorRef.current = new ambisonics.sceneRotator(audioContext, maxOrder);
        decoderRef.current = new ambisonics.binDecoder(audioContext, maxOrder);
        analyserRef.current = new ambisonics.intensityAnalyser(audioContext, maxOrder);
        const gainOut = audioContext.createGain();

        // Connect audio graph
        // mirrorRef.current.out.connect(rotatorRef.current.in);
        rotatorRef.current.out.connect(limiterRef.current.in);
        limiterRef.current.out.connect(decoderRef.current.in);
        decoderRef.current.out.connect(gainOut);
        gainOut.connect(audioContext.destination);

        // Load sound and filters
        const loader_sound = new ambisonics.HOAloader(audioContext, maxOrder, soundUrl, assignSample2SoundBuffer);
        loader_sound.load();

        const loader_filters = new ambisonics.HOAloader(audioContext, maxOrder, irUrl_2, assignSample2Filters);
        loader_filters.load();
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
            <input type="range" min="-180" max="180" value={sliderValue} onChange={handleSliderChange} />

            <button onClick={resumeAudioContext}>Start Audio</button>
            <button onClick={handleToggleClick} disabled={playButtonDisabled}>
                {isSoundPlaying ? 'Stop' : 'Play'}
            </button>
        </div>
    );
};

export default AmbisonicAudio;
