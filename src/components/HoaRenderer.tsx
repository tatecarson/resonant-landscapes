import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { PlayCircleIcon, StopCircleIcon } from '@heroicons/react/24/solid'
import { Switch } from '@headlessui/react'
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';

import stateParks from '../data/stateParks.json';
import LeavesCanvas from './LeavesCanvas';

function soundPath(parkName: string, parksJSON) {

    const foundPark = parksJSON.find(park => park.name === parkName);
    const recordingsCount = foundPark?.recordingsCount;
    const sectionsCount = foundPark?.sectionsCount;
    const cleanParkName = parkName.split(' ').slice(0, 2).join('-')

    const recordingPicker = Math.floor(Math.random() * recordingsCount) + 1;
    const sectionPicker = Math.floor(Math.random() * sectionsCount) + 1;

    // const s3 = "https://sd-state-parks.s3.us-east-2.amazonaws.com/parks/"
    const url = [`./sounds/${cleanParkName}-${recordingPicker}-00${sectionPicker}_8ch.m4a`,
    `./sounds/${cleanParkName}-${recordingPicker}-00${sectionPicker}_mono.m4a`]

    return url;
}


const HOARenderer = ({ parkName, parkDistance, userOrientation }) => {
    const { playSound,
        stopSound, loadBuffers, bufferSourceRef, isLoading, setIsLoading,
        isPlaying, setIsPlaying, buffers, setBuffers } = useAudioContext();
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
            stopSound();
            setIsPlaying(false);

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

            if (showGimbalArrow) {
                // toggleGimbalArrowVisibility();
                setShowGimbalArrow(false);
            }

        } else {
            if (buffers.length > 0) {
                playSound(buffers);
            }
        }
    }, [buffers, isPlaying, playSound, stopSound]);



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
                    {
                        isPlaying && parkDistance < 2 &&
                        <Switch.Group>
                            <div className="flex items-center">
                                <Switch.Label className="mr-4">Enable Body-Oriented Tracking</Switch.Label>
                                <Switch
                                    checked={showGimbalArrow}
                                    onChange={setShowGimbalArrow}
                                    className={`${showGimbalArrow ? 'bg-blue-600' : 'bg-gray-200'
                                        } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
                                >
                                    <span
                                        className={`${showGimbalArrow ? 'translate-x-6' : 'translate-x-1'
                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </Switch>
                            </div>
                        </Switch.Group>
                    }

                    <br></br>
                    {isPlaying && !showGimbalArrow && <LeavesCanvas parkDistance={parkDistance} />}
                    {isPlaying && showGimbalArrow && <GimbalArrow />}
                </>
            )}
        </div>
    );
}

export default HOARenderer;