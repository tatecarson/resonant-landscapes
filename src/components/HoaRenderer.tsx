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
    const [orientation, setOrientation] = useState({ x: 0, y: 0, z: 0 });

    const exampleSoundPathList = ['/sounds/output_8ch.m4a', '/sounds/output_mono.m4a']

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


    const handleListenerPosition = (event) => {
        const { name, value } = event.target;
        setPosition(prevPosition => {
            const newPosition = { ...prevPosition, [name]: value };
            sceneRef.current.setListenerPosition(newPosition.x, newPosition.y, newPosition.z);
            return newPosition;
        });
    };

    const handleListenerOrientation = (event) => {
        const { name, value } = event.target;

        setOrientation(prevPosition => {
            const newOrientation = { ...prevPosition, [name]: value };
            sceneRef.current.setListenerOrientation(newOrientation.x, newOrientation.y, newOrientation.z, 0, 1, 0);
            return newOrientation;
        });
    }

    return (
        <div>
            <h1>Example: HOARenderer update</h1>
            <p>HOARenderer is an optimized higher-order ambisonic renderer...</p>
            <div id="secSource">


                <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
            </div>
            <div>
                <h2>Listener Position</h2>
                <label htmlFor="x">X: </label>
                <input type="range" id="x" min="0" max="10" name="x" value={position.x} onChange={handleListenerPosition} />
                <label htmlFor="y">Y: </label>
                <input type="range" id="y" min="0" max="10" name="y" value={position.y} onChange={handleListenerPosition} />
                <label htmlFor="z">Z: </label>
                <input type="range" id="z" min="0" max="10" name="z" value={position.z} onChange={handleListenerPosition} />
            </div>

            <div>
                <h2>Listener Orientation</h2>
                <label htmlFor="x">X: </label>
                <input type="range" id="x" min="0" max="10" name="x" value={orientation.x} onChange={handleListenerOrientation} />
                <label htmlFor="y">Y: </label>
                <input type="range" id="y" min="0" max="10" name="y" value={orientation.y} onChange={handleListenerOrientation} />
                <label htmlFor="z">Z: </label>
                <input type="range" id="z" min="0" max="10" name="z" value={orientation.z} onChange={handleListenerOrientation} />
            </div>
        </div>
    );
}

export default HOARenderer;