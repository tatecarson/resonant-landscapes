import React, { useEffect, useState, useContext, useRef } from 'react';
import { AudioContext } from '../contexts/AudioContextProvider';
import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { ResonanceAudio } from "resonance-audio";

const HOARenderer = () => {
    const audioContext = useContext(AudioContext);
    const sceneGain = useRef(null);
    const sceneRef = useRef(null);
    const sourceRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [sound, setSound] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);
    const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });

    const exampleSoundPathList = ['/sounds/HOA3_rec1_01-08ch.ogg', '/sounds/HOA3_rec1_09-16ch.ogg']

    useEffect(() => {
        if (!audioContext) {
            return;
        }

        sceneGain.current = audioContext.createGain();
        sceneRef.current = new ResonanceAudio(audioContext, { ambisonicOrder: 2 });

        // toaRenderer.current = Omnitone.createHOARenderer(audioContext);
        sourceRef.current = sceneRef.current.createSource();
        sceneRef.current.output.connect(sceneGain.current);
        sceneGain.current.connect(audioContext.destination);

        Promise.all([
            Omnitone.createBufferList(audioContext, exampleSoundPathList),
            // toaRenderer.current.initialize(),
        ]).then((results) => {
            setSoundBuffer(Omnitone.mergeBufferListByChannel(audioContext, results[0]))
            // sceneGain.current.connect(toaRenderer.current.input);

            // toaRenderer.current.output.connect(audioContext.destination);

            setIsPlaying(false);
        });
    }, [audioContext]);


    const onTogglePlayback = () => {


        if (!isPlaying) {
            sourceRef.current = sceneRef.current.createSource();
            // center of the room 
            sourceRef.current.setPosition(-0.707, -0.707, 0);

            const currentBufferSource = audioContext.createBufferSource();
            currentBufferSource.buffer = soundBuffer;
            currentBufferSource.loop = true;
            currentBufferSource.connect(sourceRef.current.input);
            currentBufferSource.start();
            setSound(currentBufferSource);
            setIsPlaying(true);
        } else {
            if (sound) {
                sound.stop(0);
            }

            setIsPlaying(false);
        }
    };


    const handleSliderChange = (event) => {
        const { name, value } = event.target;
        setPosition(prevPosition => {
            const newPosition = { ...prevPosition, [name]: value };
            sceneRef.current.setListenerPosition(newPosition.x, newPosition.y, newPosition.z);
            return newPosition;
        });
    };
    return (
        <div>
            <h1>Example: HOARenderer</h1>
            <p>HOARenderer is an optimized higher-order ambisonic renderer...</p>
            <div id="secSource">


                <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
            </div>
            <div>
                <label htmlFor="x">X: </label>
                <input type="range" id="x" min="0" max="10" name="x" value={position.x} onChange={handleSliderChange} />
                <label htmlFor="y">Y: </label>
                <input type="range" id="y" min="0" max="10" name="y" value={position.y} onChange={handleSliderChange} />
                <label htmlFor="z">Z: </label>
                <input type="range" id="z" min="0" max="10" name="z" value={position.z} onChange={handleSliderChange} />
            </div>
        </div>
    );
}

export default HOARenderer;