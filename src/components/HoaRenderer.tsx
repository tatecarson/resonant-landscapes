'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }) {
    console.assert(error);
    return (
        <div role="alert">
            <p>Something went wrong:</p>
            <pre>{error.message}</pre>
            <button onClick={resetErrorBoundary}>Try again</button>
        </div>
    )
}

const HOARenderer = ({ userOrientation }) => {
    const { audioContext, resonanceAudioScene, playSound,
        stopSound, loadBuffers, isLoading, isPlaying, buffers } = useAudioContext();


    const [showGimbalArrow, setShowGimbalArrow] = useState(false);
    const [forward, setForward] = useState({ x: 0, y: 0, z: 0 });
    const [up, setUp] = useState({ x: 0, y: 0, z: 0 });
    const [isReady, setIsReady] = useState(false);

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

    useEffect(() => {
        async function load() {
            if (audioContext && buffers.length === 0) {
                await loadBuffers(exampleSoundPathList);
                setIsReady(true);
            }
        }
        load();
    }, [audioContext, buffers.length, loadBuffers]);


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

    const toggleGimbalArrowVisibility = () => {
        setShowGimbalArrow(prevState => !prevState);
    };


    // const onToggleOrientation

    // const handleSetForward = useCallback((vector) => {
    //     // console.log(vector)
    //     setForward(vector);
    // }, []);

    // const handleSetUp = useCallback((vector) => {
    //     setUp(vector);
    // }, []);

    // useEffect(() => {
    //     if (resonanceAudioScene && isPlaying && !isLoading && userOrientation) {
    //         resonanceAudioScene.setListenerOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    //     }
    // }, [forward, up, isPlaying, userOrientation])

    return (
        <div id="secSource">
            {
                isLoading ? (
                    <div>Loading...</div>
                ) : (
                    <>
                        <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
                        <br></br>
                        {isPlaying && userOrientation && <button onClick={toggleGimbalArrowVisibility}>Toggle Gimbal Arrow</button>}
                        {showGimbalArrow && <GimbalArrow />}
                    </>
                )
            }

        </div>
    );
}

export default HOARenderer;