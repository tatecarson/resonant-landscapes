import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';

const HOARenderer = ({ userOrientation }) => {
    const { playSound,
        stopSound, loadBuffers, isLoading, setIsLoading, isPlaying, buffers, setBuffers } = useAudioContext();
    const [loadError, setLoadError] = useState(null); // State to track loading errors
    const [showGimbalArrow, setShowGimbalArrow] = useState(false);

    // TODO: load other sound files 

    useEffect(() => {
        const exampleSoundPathList = ['/sounds/hartford-beach-1-8ch.m4a', '/sounds/hartford-beach-1-mono.m4a']
        // const exampleSoundPathList = ['/sounds/newton-hills-1-8ch.m4a', '/sounds/newton-hills-1-mono.m4a'];
        // const exampleSoundPathList = ['/sounds/output_8ch-smc.m4a', '/sounds/output_mono-smc.m4a']

        const load = async () => {
            await loadBuffers(exampleSoundPathList)
        }
        load()

    }, []);

    useEffect(() => {
        console.log('Is loading:', isLoading);
    }, [isLoading])

    // Cleanup effect
    useEffect(() => {
        return () => {
            console.log('Cleanup on unmount');
            // Cleanup logic here, if any
            if (isPlaying) {
                stopSound();
            }

            setBuffers([]); // Clear the buffers
        };
    }, []);

    const onTogglePlayback = useCallback(() => {
        if (isPlaying) {
            stopSound();
        } else {
            if (buffers.length > 0) {

                playSound();
            }
        }
    }, [buffers, isPlaying, playSound, stopSound]);

    const toggleGimbalArrowVisibility = () => {
        setShowGimbalArrow(prevState => !prevState);
    };



    const retryLoading = useCallback(() => {
        setLoadError(null); // Reset error state before retrying
        // Reattempt loading buffers here; this requires refactoring to avoid duplication
    }, []); // Add dependencies if necessary


    return (
        <div id="secSource">
            {isLoading && <div>Loading...</div>}

            {loadError && (
                <div>
                    <p>Failed to load buffers:</p>
                    <pre>{loadError.message}</pre>
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
        </div>
    );
}

export default HOARenderer;