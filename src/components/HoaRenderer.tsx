import React, { useEffect, useState, useContext, useRef, useCallback } from 'react';
import { AudioContext } from '../contexts/AudioContextProvider';
import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { ResonanceAudio } from "resonance-audio";
import Gimbal from '../js/Gimbal';

const HOARenderer = () => {
    const audioContext = useContext(AudioContext);
    const sceneGain = useRef(null);
    const sceneRef = useRef(null);
    const sourceRef = useRef(null);
    const gimbalRef = useRef(null);
    const requestRef = useRef<number>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sound, setSound] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);
    const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
    const [orientation, setOrientation] = useState({ x: 0, y: 0, z: 0 });

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']
    const DEG = 180 / Math.PI;

    useEffect(() => {
        gimbalRef.current = new Gimbal();
    }, [])

    useEffect(() => {
        if (!audioContext) {
            return;
        }

        sceneGain.current = audioContext.createGain(); ``
        sceneRef.current = new ResonanceAudio(audioContext, { ambisonicOrder: 2 });

        // toaRenderer.current = Omnitone.createHOARenderer(audioContext);
        sourceRef.current = sceneRef.current.createSource();
        sceneRef.current.output.connect(sceneGain.current);
        sceneGain.current.connect(audioContext.destination);

        Promise.all([
            Omnitone.createBufferList(audioContext, exampleSoundPathList),

        ]).then((results) => {
            setSoundBuffer(Omnitone.mergeBufferListByChannel(audioContext, results[0]))


            setIsPlaying(false);
        });
    }, [audioContext]);

    const permission = useCallback(() => {
        if (typeof (DeviceMotionEvent) !== "undefined" && typeof (DeviceMotionEvent.requestPermission) === "function") {
            DeviceMotionEvent.requestPermission()
                .then(response => {
                    if (response === "granted") {
                        gimbalRef.current.enable();

                        animate()
                    }
                })
                .catch(console.error)
        } else {
            alert("DeviceMotionEvent is not defined");
        }
    }, []);

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

    const handleListenerOrientation = (event: { target: { name: any; value: any; }; }) => {
        const { name, value } = event.target;

        setOrientation(prevPosition => {
            const newOrientation = { ...prevPosition, [name]: value };
            sceneRef.current.setListenerOrientation(newOrientation.x, newOrientation.y, newOrientation.z, 0, 1, 0);
            return newOrientation;
        });
    }

    const animate = () => {
        // animation code here
        gimbalRef.current.update();
        // console.count('animate')

        console.log('Gimabal Data: ', gimbalRef.current.yaw, gimbalRef.current.pitch, gimbalRef.current.roll)
        console.log("Deg: ", gimbalRef.current.yaw * DEG, gimbalRef.current.pitch * DEG, gimbalRef.current.roll * DEG)

        // TODO: use gimbal data to update orientation
        requestRef.current = requestAnimationFrame(animate)
        if (gimbalRef.current) {
        }
    }
    useEffect(() => {
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    return (
        <div>
            <h1>Example: HOARenderer 2</h1>
            <p>HOARenderer is an optimized higher-order ambisonic renderer...</p>
            <div id="secSource">

                <button id="request" onClick={permission}>Request Permission</button>

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