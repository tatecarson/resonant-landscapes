import { useState, useEffect, useRef, useContext } from "react";
import { ResonanceAudio } from "resonance-audio";
import { createBufferList, mergeBufferListByChannel } from 'omnitone';
import { AudioContext } from '../contexts/AudioContextProvider';
import { render } from "react-dom";

const ResonanceAudioComponent = () => {
    const audioContext = useContext(AudioContext);
    const [isSoundPlaying, setIsSoundPlaying] = useState(false);
    const [sound, setSound] = useState(null);
    const [playButtonDisabled, setPlayButtonDisabled] = useState(true);
    const [audioElement, setAudioElement] = useState(new Audio('resources/SpeechSample.wav'));

    const sceneRef = useRef(null);



    useEffect(() => {
        if (!audioContext) {
            return;
        }

        sceneRef.current = new ResonanceAudio(audioContext, { ambisonicOrder: 3 });
        sceneRef.current.output.connect(audioContext.destination);

        let audioElementSource = audioContext.createMediaElementSource(audioElement);
        let source = sceneRef.current.createSource();
        console.log(source)
        audioElementSource.connect(source.input);

        createBufferList(audioContext, exampleSoundPathList).then(bufferList => {
            toaRenderer.initialize().then((results) => {
                setSoundBuffer(mergeBufferListByChannel(audioContext, results[0]));
                // You can start the audio context after the renderer is initialized.
                resumeAudioContext();
            });
        });

    }, [audioContext])

    const resumeAudioContext = async () => {
        if (audioContext && audioContext.state === "suspended") {
            await audioContext.resume();
        }

        console.log(audioContext)
        // ... load audio files or start playback
    };


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


    return (
        <div>
            {/* <input type="range" min="-180" max="180" value={sliderValue} onChange={handleSliderChange} /> */}

            <button onClick={resumeAudioContext}>Start Audio</button>
            <button onClick={handleToggleClick} disabled={playButtonDisabled}>
                {isSoundPlaying ? 'Stop' : 'Play'}
            </button>
        </div>
    )
}

export default ResonanceAudioComponent;