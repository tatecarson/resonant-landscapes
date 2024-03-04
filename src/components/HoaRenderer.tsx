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
    const { audioContext, playSound,
        stopSound, loadBuffers, isLoading, setIsLoading, isPlaying, buffers } = useAudioContext();

    const [loadError, setLoadError] = useState(null); // State to track loading errors

    const [showGimbalArrow, setShowGimbalArrow] = useState(false);
    const [forward, setForward] = useState({ x: 0, y: 0, z: 0 });
    const [up, setUp] = useState({ x: 0, y: 0, z: 0 });
    const [isReady, setIsReady] = useState(false);

    const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

    useEffect(() => {
        // Define the loadBuffers function within the useEffect or import it if defined externally
        const load = async () => {
            console.log("Loading buffers...");
            if (audioContext && !isLoading && buffers.length === 0) {
                try {
                    console.log('Loading buffers...');
                    setIsLoading(true);
                    // Assuming loadBuffers is available in the context or imported
                    await loadBuffers(exampleSoundPathList);
                } catch (error) {
                    console.error('Failed to load buffers:', error);
                    setLoadError(error.message); // Set the error message to display it to the user
                } finally {
                    setIsLoading(false);
                }
            }
        };

        load();
    }, [audioContext, buffers.length, isLoading]); // Depend on relevant states


    const retryLoading = () => {
        setLoadError(null); // Reset the error state
        // You can directly call load() here if it's defined within this useEffect,
        // or trigger the loading logic by changing a state that load() depends on.
    };


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

    return (
        <div id="secSource">
            {isLoading && <div>Loading...</div>}

            {loadError && (
                <div>
                    <p>Failed to load buffers:</p>
                    <pre>{loadError}</pre>
                    <button onClick={retryLoading}>Retry</button>
                </div>
            )}
            {!isLoading && !loadError && (
                <>
                    <button onClick={onTogglePlayback}>{isPlaying ? 'Stop' : 'Play'}</button>
                    <br></br>
                    {isPlaying && userOrientation && <button onClick={toggleGimbalArrowVisibility}>Toggle Gimbal Arrow</button>}
                    {showGimbalArrow && <GimbalArrow />}
                </>
            )}

            {/* 
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
            } */}

        </div>
    );
}

export default HOARenderer;