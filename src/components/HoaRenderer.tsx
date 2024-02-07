import React, { useEffect, useState, useContext, useRef, useCallback, Suspense } from 'react';
import { AudioContext } from '../contexts/AudioContextProvider';
import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { ResonanceAudio } from "resonance-audio";
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import GimbalComponent from './Gimbal';
import Gimbal from '../js/Gimbal';
import useGimbalStore from '../stores/gimbalStore';


const HOARenderer = () => {
    const audioContext = useContext(AudioContext);
    const sceneGain = useRef(null);
    const sceneRef = useRef(null);
    const sourceRef = useRef(null);

    const requestRef = useRef<number>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sound, setSound] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);

    const yaw = useGimbalStore(state => state.yaw);
    const pitch = useGimbalStore(state => state.pitch);
    const roll = useGimbalStore(state => state.roll);

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']
    // const DEG = 180 / Math.PI;

    // useEffect(() => {
    //     gimbalRef.current = new Gimbal();
    // }, [])

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

        ]).then((results) => {
            setSoundBuffer(Omnitone.mergeBufferListByChannel(audioContext, results[0]))


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

            animate();
        } else {
            if (sound) {
                sound.stop(0);
            }

            setIsPlaying(false);
        }
    };

    // Roll = X, Pitch = Y,Yaw = Z,

    const animate = () => {
        try {
            if (Number.isFinite(yaw)) {
                // console.log('yaw: ', yaw)

                // FIXME: this is updating but doesn't seem to have any effect on the sound
                sceneRef.current.setListenerOrientation(pitch, yaw, roll, 0, 1, 0);

            }

            requestRef.current = requestAnimationFrame(animate)
        } catch (error) {
            console.error("Error in animate: ", error)
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
            <div id="secSource">

                <p>Yaw: {yaw}</p>

                <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
            </div>


            {/* <div>
                <h2>Listener Position</h2>
                <label htmlFor="x">X: </label>
                <input type="range" id="x" min="0" max="10" name="x" value={position.x} onChange={handleListenerPosition} />
                <label htmlFor="y">Y: </label>
                <input type="range" id="y" min="0" max="10" name="y" value={position.y} onChange={handleListenerPosition} />
                <label htmlFor="z">Z: </label>
                <input type="range" id="z" min="0" max="10" name="z" value={position.z} onChange={handleListenerPosition} />
            </div> */}

            {/* <div>
                <h2>Listener Orientation</h2>
                <label htmlFor="x">X: </label>
                <input type="range" id="x" min="0" max="10" name="x" value={orientation.x} onChange={handleListenerOrientation} />
                <label htmlFor="y">Y: </label>
                <input type="range" id="y" min="0" max="10" name="y" value={orientation.y} onChange={handleListenerOrientation} />
                <label htmlFor="z">Z: </label>
                <input type="range" id="z" min="0" max="10" name="z" value={orientation.z} onChange={handleListenerOrientation} />
            </div> */}
        </div>
    );
}

export default HOARenderer;