import React, { useEffect, useCallback, useRef, useState } from 'react';
import { StopCircleIcon } from '@heroicons/react/24/solid'
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
    rotationActive: boolean;
    onRotationActiveChange: (next: boolean) => void;
    permissionGranted: boolean;
    onPermissionGranted: () => void;
}

const HOARenderer = ({
    parkName,
    parkDistance,
    userOrientation,
    compact = false,
    rotationActive,
    onRotationActiveChange,
    permissionGranted,
    onPermissionGranted,
}: HOARendererProps) => {
    const { playSound, stopSound, loadBuffers, clearLoadError, cancelPendingLoad } = useAudioEngine();
    const { isLoading, isPlaying, isAudioUnlocked, buffers, loadError, lastUnlockError } = useAudioPlaybackState();
    const [pathError, setPathError] = useState<string | null>(null);
    const [shouldAutoPlay, setShouldAutoPlay] = useState(true);
    const [allowManualRestart, setAllowManualRestart] = useState(false);
    const activeError = pathError ?? loadError;
    const showFallbackStart = !isPlaying && !isLoading && !activeError && (allowManualRestart || !isAudioUnlocked || Boolean(lastUnlockError));
    useRenderDebug("HOARenderer", {
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        compact,
        isLoading,
        isPlaying,
        isAudioUnlocked,
        hasBuffers: Boolean(buffers),
        loadError,
        lastUnlockError,
        rotationActive,
        permissionGranted,
        pathError,
        shouldAutoPlay,
        allowManualRestart,
        showFallbackStart,
    });
    // Track whether this instance is still mounted so cleanup can distinguish
    // a parkName change (still mounted → stop old park's sound) from an unmount
    // caused by layout switching (Dialog ↔ strip) where sound should keep playing.
    const isMountedRef = useRef(true);
    useEffect(() => {
        return () => { isMountedRef.current = false; };
    }, []);

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

    useEffect(() => {
        let isCurrent = true;
        setShouldAutoPlay(true);
        setAllowManualRestart(false);

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
            // Only stop sound when the park actually changed — not when the component
            // unmounts for layout reasons (Dialog ↔ strip switch on rotationActive).
            if (isMountedRef.current) {
                audioActionsRef.current.stopSound();
            }
        };
    }, [parkName]);

    useEffect(() => {
        if (!shouldAutoPlay || !isAudioUnlocked || isLoading || isPlaying || activeError || buffers === null) {
            return;
        }

        playSound();
        setShouldAutoPlay(false);
        setAllowManualRestart(false);
    }, [activeError, buffers, isAudioUnlocked, isLoading, isPlaying, playSound, shouldAutoPlay]);

    const onTogglePlayback = useCallback(() => {
        if (isPlaying) {
            setShouldAutoPlay(false);
            setAllowManualRestart(true);
            stopSound();
            if (rotationActive) {
                onRotationActiveChange(false);
            }
        } else {
            if (buffers !== null) {
                setShouldAutoPlay(false);
                setAllowManualRestart(false);
                playSound();
            }
        }
    }, [buffers, isPlaying, playSound, stopSound, rotationActive, onRotationActiveChange]);

    const audioStatusLabel = isLoading
        ? "Loading audio"
        : activeError
            ? "Audio unavailable"
            : isPlaying
                ? "Playing automatically"
                : showFallbackStart
                    ? allowManualRestart
                        ? "Playback stopped"
                        : "Autoplay unavailable"
                    : "Waiting for playback";

    const retryLoading = useCallback(() => {
        const soundPathList = pickSoundPath(parkName, stateParks, navigator.userAgent);
        if (!soundPathList) {
            setPathError(`No valid sound path is configured for "${parkName}".`);
            return;
        }

        setPathError(null);
        setShouldAutoPlay(true);
        clearLoadError();
        cancelPendingLoad();
        void loadBuffers(soundPathList);
    }, [cancelPendingLoad, clearLoadError, loadBuffers, parkName]);

    return (
        <div id="secSource">
            <div className={compact ? "flex items-center gap-3" : "space-y-4"}>
                <div className="space-y-1">
                    <p className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/50">
                        {audioStatusLabel}
                    </p>
                    {!activeError && (
                        <p className="font-space-mono text-[11px] text-neutral-900/70">
                            {isPlaying
                                ? "Audio started when you entered the listening area."
                                : allowManualRestart
                                    ? "Tap start audio to resume this park."
                                    : showFallbackStart
                                    ? "Use the fallback start if autoplay was blocked."
                                    : "Audio will start as soon as this park is ready."}
                        </p>
                    )}
                </div>

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

                {!activeError && (
                    <div className={compact ? "flex items-center gap-2" : "flex items-center gap-3"}>
                        {isPlaying && (
                            <button
                                onClick={onTogglePlayback}
                                aria-label="Stop playback"
                                className={compact
                                    ? "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
                                    : "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
                                }
                            >
                                <StopCircleIcon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
                                <span>Stop</span>
                            </button>
                        )}

                        {showFallbackStart && (
                            <button
                                onClick={onTogglePlayback}
                                aria-label="Start playback fallback"
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-900/30 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-white/30"
                            >
                                <span>Start Audio</span>
                            </button>
                        )}
                    </div>
                )}

                {!compact && isPlaying && !rotationActive && <LeavesCanvas parkDistance={parkDistance} />}

                {/* GimbalArrow runs whenever rotation is active — no !compact guard so audio tracking survives modal collapse */}
                {isPlaying && rotationActive && (
                    <GimbalArrow
                        permissionGranted={permissionGranted}
                        onPermissionGranted={onPermissionGranted}
                        hideUI={compact}
                    />
                )}
            </div>
        </div>
    );
}

export default HOARenderer;
