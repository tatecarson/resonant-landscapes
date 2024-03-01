import React, { useEffect, useState, useContext, useRef, memo, useCallback, Suspense } from 'react';
// import Omnitone from 'omnitone/build/omnitone.min.esm.js';
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';
// import useGimbalStore from '../stores/gimbalStore';

const HOARenderer = () => {
    const { audioContext, resonanceAudioScene, playSound, stopSound, loadBuffers, isLoading, isPlaying, buffers } = useAudioContext();

    const requestRef = useRef<number>(null);

    // const forwardX = useGimbalStore(state => state.forwardX);
    // const latestForwardX = useRef(forwardX);
    // const forwardY = useGimbalStore(state => state.forwardY);
    // const latestForwardY = useRef(forwardY);
    // const forwardZ = useGimbalStore(state => state.forwardZ);
    // const latestForwardZ = useRef(forwardZ);
    // const upX = useGimbalStore(state => state.upX);
    // const latestUpX = useRef(upX);
    // const upY = useGimbalStore(state => state.upY);
    // const latestUpY = useRef(upY);
    // const upZ = useGimbalStore(state => state.upZ);
    // const latestUpZ = useRef(upZ);

    // const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

    // Effect to load buffers on component mount

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

    useEffect(() => {
        async function load() {
            if (audioContext && buffers.length === 0) {
                await loadBuffers(exampleSoundPathList);
            }
        }
        load();
    }, [audioContext, buffers.length, loadBuffers]); // Ensure dependencies are correctly listed


    // Cleanup effect
    useEffect(() => {
        return () => {
            console.log('Cleanup on unmount');
            // Cleanup logic here, if any
            if (isPlaying) {
                stopSound();
            }
        };
    }, []);

    const onTogglePlayback = useCallback(() => {
        if (isPlaying) {
            stopSound();
        } else {
            playSound(buffers[0]);
        }
    }, [buffers, playSound, stopSound]);

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
                <div>Loading...</div>
            ) : (
                <>
                    <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
                    <GimbalArrow />
                </>
            )}
        </div>
    );
}

export default HOARenderer;