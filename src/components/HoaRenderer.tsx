import React, { useEffect, useState, useCallback } from 'react';
import { PlayCircleIcon, StopCircleIcon } from '@heroicons/react/24/solid'
import { Switch } from '@headlessui/react'
import { useAudioContext } from '../contexts/AudioContextProvider';
import GimbalArrow from './GimbalArrow';

import stateParks from '../data/stateParks.json';
import LeavesCanvas from './LeavesCanvas';

function soundPath(parkName: string, parksJSON) {
    const cdn = 'https://resonant-landscapes.b-cdn.net/sounds/';

    if (parkName === 'Custer Test') {
        return [
            `${cdn}Custer-Test-1-001_8ch.wav`,
            `${cdn}Custer-Test-1-001_mono.wav`
        ];
    }

    const foundPark = parksJSON.find(park => park.name === parkName);
    const recordingsCount = foundPark?.recordingsCount;
    const sectionsCount = foundPark?.sectionsCount;
    const cleanParkName = parkName.split(' ').slice(0, 2).join('-')
    const extension = 'm4a';

    const recordingPicker = Math.floor(Math.random() * recordingsCount) + 1;
    const sectionPicker = Math.floor(Math.random() * sectionsCount) + 1;

    const url = [`${cdn}${cleanParkName}-${recordingPicker}-00${sectionPicker}_8ch.${extension}`,
    `${cdn}${cleanParkName}-${recordingPicker}-00${sectionPicker}_mono.${extension}`]

    return url;
}


const HOARenderer = ({ parkName, parkDistance, userOrientation, compact = false }) => {
    const { playSound,
        stopSound, loadBuffers, bufferSourceRef, isLoading, setIsLoading,
        isPlaying, setIsPlaying, buffers, setBuffers, loadError, clearLoadError } = useAudioContext();
    const [showGimbalArrow, setShowGimbalArrow] = useState(false);

    // TODO: load other sound files 

    useEffect(() => {
        const load = async () => {
            const soundPathList = soundPath(parkName, stateParks);

            console.log(soundPathList)
            clearLoadError();
            await loadBuffers(soundPathList);
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
        clearLoadError();
        loadBuffers(soundPath(parkName, stateParks));
    }, [clearLoadError, loadBuffers, parkName]);


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
                    <button
                        onClick={onTogglePlayback}
                        aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
                        className={compact ? "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm" : undefined}
                    >
                        {isPlaying ?
                        <StopCircleIcon className="h-10 w-10 text-green-600" aria-hidden="true" /> :
                        <PlayCircleIcon className="h-10 w-10 text-green-600" aria-hidden="true" />}
                        {compact && <span>{isPlaying ? 'Stop' : 'Play'}</span>}
                    </button>
                    {
                        !compact && isPlaying && parkDistance < 2 &&
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
                    {!compact && isPlaying && !showGimbalArrow && <LeavesCanvas parkDistance={parkDistance} />}
                    {!compact && isPlaying && showGimbalArrow && <GimbalArrow />}
                </>
            )}
        </div>
    );
}

export default HOARenderer;
