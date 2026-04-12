import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PlayCircleIcon, StopCircleIcon } from '@heroicons/react/24/solid'
import { Switch } from '@headlessui/react'
import { useAudioEngine, useAudioPlaybackState } from '../contexts/AudioContextProvider';
import { useRenderDebug } from "../hooks/useRenderDebug";
import GimbalArrow from './GimbalArrow';

import stateParks from '../data/stateParks.json';
import LeavesCanvas from './LeavesCanvas';
import { pickSoundPath } from '../utils/audioPaths';

interface HOARendererProps {
    parkName: string;
    parkDistance: number;
    userOrientation: boolean;
    compact?: boolean;
}

const HOARenderer = ({ parkName, parkDistance, userOrientation, compact = false }: HOARendererProps) => {
    const { playSound, stopSound, loadBuffers, clearLoadError, cancelPendingLoad } = useAudioEngine();
    const { isLoading, isPlaying, buffers, loadError } = useAudioPlaybackState();
    const [showGimbalArrow, setShowGimbalArrow] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [pathError, setPathError] = useState<string | null>(null);
    useRenderDebug("HOARenderer", {
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        compact,
        isLoading,
        isPlaying,
        hasBuffers: Boolean(buffers),
        loadError,
        showGimbalArrow,
        permissionGranted,
        pathError,
    });
    const audioActionsRef = useRef({
        loadBuffers,
        stopSound,
        clearLoadError,
        cancelPendingLoad,
    });

    useEffect(() => {
        audioActionsRef.current = {
            loadBuffers,
            stopSound,
            clearLoadError,
            cancelPendingLoad,
        };
    }, [cancelPendingLoad, clearLoadError, loadBuffers, stopSound]);

    // TODO: load other sound files 

    useEffect(() => {
        let isCurrent = true;

        const load = async () => {
            const soundPathList = pickSoundPath(parkName, stateParks, navigator.userAgent);
            if (!soundPathList) {
                if (isCurrent) {
                    setPathError(`No valid sound path is configured for "${parkName}".`);
                }
                return;
            }

            if (isCurrent) {
                setPathError(null);
                audioActionsRef.current.clearLoadError();
            }

            await audioActionsRef.current.loadBuffers(soundPathList);
        };

        void load();

        return () => {
            isCurrent = false;
            audioActionsRef.current.cancelPendingLoad();
            audioActionsRef.current.clearLoadError();
            audioActionsRef.current.stopSound();
            setShowGimbalArrow(false);
            setPermissionGranted(false);
        };
    }, [parkName]);

    const onTogglePlayback = useCallback(() => {
        if (isPlaying) {
            stopSound();

            if (showGimbalArrow) {
                // toggleGimbalArrowVisibility();
                setShowGimbalArrow(false);
            }

        } else {
            if (buffers !== null) {
                playSound();
            }
        }
    }, [buffers, isPlaying, playSound, stopSound]);



    const retryLoading = useCallback(() => {
        const soundPathList = pickSoundPath(parkName, stateParks, navigator.userAgent);
        if (!soundPathList) {
            setPathError(`No valid sound path is configured for "${parkName}".`);
            return;
        }

        setPathError(null);
        clearLoadError();
        cancelPendingLoad();
        void loadBuffers(soundPathList);
    }, [cancelPendingLoad, clearLoadError, loadBuffers, parkName]);

    const activeError = pathError ?? loadError;

    return (
        <div id="secSource">
            {isLoading && <div>Loading...</div>}

            {activeError && (
                <div className="max-w-sm rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 shadow-sm">
                    <p className="font-semibold">Audio unavailable</p>
                    <p className="mt-1">Failed to load the selected park audio.</p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-xs text-rose-800">{activeError}</pre>
                    <button
                        onClick={retryLoading}
                        className="mt-3 inline-flex items-center rounded-full border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 shadow-sm"
                    >
                        Retry audio load
                    </button>
                </div>
            )}
            {!isLoading && !activeError && (
                <>
                    <button
                        onClick={onTogglePlayback}
                        aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
                        className={compact
                            ? "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
                            : "inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
                        }
                    >
                        {isPlaying ?
                        <StopCircleIcon className={compact ? "h-4 w-4" : "h-12 w-12 text-neutral-900"} aria-hidden="true" /> :
                        <PlayCircleIcon className={compact ? "h-4 w-4" : "h-12 w-12 text-neutral-900"} aria-hidden="true" />}
                        {compact && <span>{isPlaying ? 'Stop' : 'Play'}</span>}
                    </button>
                    {
                        !compact && isPlaying && parkDistance < 2 &&
                        <Switch.Group>
                            <div className="flex items-center">
                                <Switch.Label className="mr-4 font-space-mono text-[11px] uppercase tracking-widest text-neutral-900/70">Body-Oriented Tracking</Switch.Label>
                                <Switch
                                    checked={showGimbalArrow}
                                    onChange={setShowGimbalArrow}
                                    className={`${showGimbalArrow ? 'bg-neutral-900' : 'bg-neutral-200'
                                        } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2`}
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
                    {!compact && isPlaying && showGimbalArrow && (
                        <GimbalArrow
                            permissionGranted={permissionGranted}
                            onPermissionGranted={() => setPermissionGranted(true)}
                        />
                    )}
                </>
            )}
        </div>
    );
}

export default HOARenderer;
