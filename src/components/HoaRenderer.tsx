import React, { useEffect, useState, useContext, useRef, memo, useCallback, Suspense } from 'react';
import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import AudioContextProvider, { useAudioContext } from '../contexts/AudioContextProvider';
// import { ResonanceAudio } from "resonance-audio";
import useGimbalStore from '../stores/gimbalStore';

const HOARenderer = () => {
    const { audioContext, resonanceAudioScene } = useAudioContext();
    const sceneGain = useRef(null);
    const sceneRef = useRef(null);
    const sourceRef = useRef(null);

    const requestRef = useRef<number>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sound, setSound] = useState(null);
    const [soundBuffer, setSoundBuffer] = useState(null);

    const forwardX = useGimbalStore(state => state.forwardX);
    const latestForwardX = useRef(forwardX);
    const forwardY = useGimbalStore(state => state.forwardY);
    const latestForwardY = useRef(forwardY);
    const forwardZ = useGimbalStore(state => state.forwardZ);
    const latestForwardZ = useRef(forwardZ);
    const upX = useGimbalStore(state => state.upX);
    const latestUpX = useRef(upX);
    const upY = useGimbalStore(state => state.upY);
    const latestUpY = useRef(upY);
    const upZ = useGimbalStore(state => state.upZ);
    const latestUpZ = useRef(upZ);

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

    // FIXME: this is rerendering loading omnitone twice
    // FIXME: actually it reloads before clicking play 
    useEffect(() => {

        if (!audioContext || !resonanceAudioScene) {
            // console.count()
            return;
        }

        console.log(audioContext, resonanceAudioScene)
        // sceneGain.current = audioContext.createGain();
        sceneRef.current = resonanceAudioScene;

        // toaRenderer.current = Omnitone.createHOARenderer(audioContext);
        sourceRef.current = resonanceAudioScene.createSource();
        resonanceAudioScene.output.connect(audioContext.destination);
        // sceneGain.current.connect(audioContext.destination);

        Promise.all([
            Omnitone.createBufferList(audioContext, exampleSoundPathList),
        ]).then((results) => {
            setSoundBuffer(Omnitone.mergeBufferListByChannel(audioContext, results[0]))

            setIsPlaying(false);
        });
    }, [audioContext, resonanceAudioScene]);

    const onTogglePlayback = () => {
        console.log('onTogglePlayback')
        if (!isPlaying) {
            console.log('play')
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

            // animate();

        } else {
            if (sound) {
                sound.stop(0);
            }

            setIsPlaying(false);
        }
    };


    // useEffect(() => {
    //     latestForwardX.current = forwardX;
    //     latestForwardY.current = forwardY;
    //     latestForwardZ.current = forwardZ;
    //     latestUpX.current = upX;
    //     latestUpY.current = upY;
    //     latestUpZ.current = upZ;

    // }, [forwardX, forwardY, forwardZ, upX, upY, upZ]);

    // const animate = () => {
    //     try {
    //         if (sceneRef.current) {
    //             sceneRef.current.setListenerOrientation(latestForwardX.current, latestForwardY.current, latestForwardZ.current, latestUpX.current, latestUpY.current, latestUpZ.current);
    //         }

    //         if (requestRef.current !== undefined) {
    //             requestRef.current = requestAnimationFrame(animate)
    //         }
    //     } catch (error) {
    //         console.error("Error in animate: ", error)
    //     }
    // }

    // useEffect(() => {
    //     return () => {
    //         if (requestRef.current) {
    //             cancelAnimationFrame(requestRef.current);
    //         }
    //     };
    // }, []);

    return (
        <>

            <div id="secSource">
                <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
            </div>

        </>
    );
}

export default memo(HOARenderer);