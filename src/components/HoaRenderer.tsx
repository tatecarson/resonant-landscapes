import React, { useEffect, useState, useContext, useRef, memo, useCallback, Suspense } from 'react';
import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { useAudioContext } from '../contexts/AudioContextProvider';
// import { ResonanceAudio } from "resonance-audio";
import useGimbalStore from '../stores/gimbalStore';

const HOARenderer = () => {
    const { audioContext, resonanceAudioScene, playSound, stopSound } = useAudioContext();

    const requestRef = useRef<number>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [soundBuffer, setSoundBuffer] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

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
            return;
        }

        setIsLoading(true);

        Promise.all([
            Omnitone.createBufferList(audioContext, exampleSoundPathList),
        ]).then((results) => {
            console.log(results)
            setSoundBuffer(Omnitone.mergeBufferListByChannel(audioContext, results[0]))

            console.log(soundBuffer)
            setIsPlaying(false);
            setIsLoading(false);
        });
    }, [audioContext, resonanceAudioScene]);


    const onTogglePlayback = () => {
        if (!isPlaying) {
            console.log('playing');
            playSound(soundBuffer);
            setIsPlaying(true);
        } else {
            stopSound();
            setIsPlaying(false)
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
        <div id="secSource">
            {isLoading ? (
                <div>Loading...</div> // Placeholder for your loading indicator
            ) : (
                <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
            )}
        </div>
    );
}

export default memo(HOARenderer);