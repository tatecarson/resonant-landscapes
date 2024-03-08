import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { PlayCircleIcon, StopCircleIcon } from '@heroicons/react/24/solid'
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';

import stateParks from '../data/stateParks.json';
import LeavesCanvas from './LeavesCanvas';

function soundPath(parkName: string, parksJSON) {

    const foundPark = parksJSON.find(park => park.name === parkName);

    const recordingsCount = foundPark?.recordingsCount;
    const sectionsCount = foundPark?.sectionsCount;

    const cleanParkName = parkName.toLowerCase().split(' ').slice(0, 2).join('-')

    const recordingPicker = Math.floor(Math.random() * recordingsCount) + 1;

    const sectionPicker = Math.floor(Math.random() * sectionsCount) + 1;

    const url = [`./sounds/${cleanParkName}-${recordingPicker}-00${sectionPicker}_8ch.m4a`,
    `./sounds/${cleanParkName}-${recordingPicker}-00${sectionPicker}_mono.m4a`]

    return url;
}


const HOARenderer = ({ parkName, userOrientation }) => {
    const { playSound,
        stopSound, loadBuffers, bufferSourceRef, isLoading, setIsLoading, isPlaying, buffers, setBuffers } = useAudioContext();
    const [loadError, setLoadError] = useState(false); // State to track loading errors
    const [showGimbalArrow, setShowGimbalArrow] = useState(false);

    // TODO: load other sound files 

    useEffect(() => {
        const load = async () => {
            const soundPathList = soundPath(parkName, stateParks);

            console.log(soundPathList)
            await loadBuffers(soundPathList);
            setLoadError(false)
        }
        load()

    }, [parkName]);

    // Cleanup effect
    useEffect(() => {
        return () => {
            console.log('Cleanup on unmount');
            // Cleanup logic here, if any
            if (isPlaying) {
                stopSound();
            }

            setIsLoading(false); // Reset loading state
            setBuffers([]); // Clear the buffers

            if (bufferSourceRef.current) {
                bufferSourceRef.current.stop();
                bufferSourceRef.current = null;
            }
        };
    }, []);

    const onTogglePlayback = useCallback(() => {
        if (isPlaying) {
            stopSound();
            toggleGimbalArrowVisibility();
        } else {
            if (buffers.length > 0) {
                playSound(buffers);
            }
        }
    }, [buffers, isPlaying, playSound, stopSound]);

    const toggleGimbalArrowVisibility = () => {
        setShowGimbalArrow(prevState => !prevState);
    };

    const retryLoading = useCallback(() => {
        setLoadError(false); // Reset error state before retrying
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
                    <button onClick={onTogglePlayback}>{isPlaying ?
                        <StopCircleIcon className="h-10 w-10 text-green-600" aria-hidden="true" /> :
                        <PlayCircleIcon className="h-10 w-10 text-green-600" aria-hidden="true" />}
                    </button>
                    <br></br>
                    <LeavesCanvas />
                    {/* TODO: make this a better UI */}
                    {isPlaying && userOrientation && <button onClick={toggleGimbalArrowVisibility}>Toggle Gimbal Arrow</button>}
                    {showGimbalArrow && <GimbalArrow />}
                </>
            )}
        </div>
    );
}

export default HOARenderer;