import React, { useEffect, useCallback, useRef, useState } from 'react';
import { StopCircleIcon } from '@heroicons/react/24/solid'
import { useAudioEngine, useAudioPlaybackState } from '../contexts/AudioContextProvider';
import { useRenderDebug } from "../hooks/useRenderDebug";
import GimbalArrow from './GimbalArrow';

import stateParks from '../data/stateParks.json';
import { getParkAudioVariants, pickSoundPath } from '../utils/audioPaths';
import { findCachedVariantForPark } from '../audio/offlineAudioCache';
import { clearActiveReplay, setActiveReplay } from '../hooks/activeReplay';
import { audio as audioCopy } from '../copy';
import { detectPlatform } from '../utils/recoverySteps';
import { isDebugEnabled } from '../config/debug';

const SILENCE_HINT_DURATION_MS = 8_000;

interface HOARendererProps {
    parkName: string;
    parkDistance: number;
    userOrientation: boolean;
    rotationActive: boolean;
    onRotationActiveChange: (next: boolean) => void;
    permissionGranted: boolean;
    onPermissionGranted: () => void;
    onOrientationUnavailable?: () => void;
}

const HOARenderer = ({
    parkName,
    parkDistance,
    userOrientation,
    rotationActive,
    onRotationActiveChange,
    permissionGranted,
    onPermissionGranted,
    onOrientationUnavailable,
}: HOARendererProps) => {
    const {
        playSound,
        stopSound,
        loadBuffers,
        clearLoadError,
        cancelPendingLoad,
        resumeInterruptedAudio,
    } = useAudioEngine();
    const {
        isEngineInitializing,
        isLoading,
        isPlaying,
        isAudioUnlocked,
        buffers,
        engineError,
        loadError,
        lastUnlockError,
        spatialDegradation,
        lastLoadReason,
        lastLoadCacheHit,
        needsAudioResume,
    } = useAudioPlaybackState();
    const [pathError, setPathError] = useState<string | null>(null);
    const [shouldAutoPlay, setShouldAutoPlay] = useState(true);
    const [allowManualRestart, setAllowManualRestart] = useState(false);
    const activeError = pathError ?? engineError ?? loadError;
    const showFallbackStart = !isPlaying && !isLoading && !activeError && (allowManualRestart || !isAudioUnlocked || Boolean(lastUnlockError));
    const hasPrefetchedAudio = lastLoadReason === "prefetch" || (lastLoadReason === "active-load" && lastLoadCacheHit === true);
    const audioStatus = activeError
        ? "error"
        : isEngineInitializing
            ? "initializing"
            : isLoading
            ? "preparing"
            : needsAudioResume
                ? "interrupted"
                : isPlaying
                ? "playing"
                : buffers !== null
                    ? showFallbackStart
                        ? "ready-manual"
                        : "ready"
                    : hasPrefetchedAudio
                        ? "approaching"
                        : "idle";

    /**
     * Copy only. Which phone is being held decides how the silent-switch
     * hint is worded, and nothing is gated on it: iPadOS reports itself as a
     * Mac and the fallback wording is safe anywhere.
     */
    const platform = detectPlatform(navigator.userAgent);

    const [showSilenceHint, setShowSilenceHint] = useState(false);

    useEffect(() => {
        if (audioStatus !== "playing") {
            setShowSilenceHint(false);
            return;
        }

        setShowSilenceHint(true);
        const timeoutId = window.setTimeout(
            () => setShowSilenceHint(false),
            SILENCE_HINT_DURATION_MS
        );

        return () => window.clearTimeout(timeoutId);
    }, [audioStatus]);

    useRenderDebug("HOARenderer", {
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        isEngineInitializing,
        isLoading,
        isPlaying,
        isAudioUnlocked,
        hasBuffers: Boolean(buffers),
        engineError,
        loadError,
        lastUnlockError,
        needsAudioResume,
        rotationActive,
        permissionGranted,
        pathError,
        shouldAutoPlay,
        allowManualRestart,
        showFallbackStart,
        audioStatus,
        lastLoadReason,
        lastLoadCacheHit,
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

    /**
     * Load the park's audio, with one fallback: if the recording the seed
     * drew cannot be fetched — no signal, or a signal too thin to carry
     * ~10 MB — and the walk already holds a recording of this park, replay
     * that instead of dead-ending. This is the whole point of keeping the
     * bytes: an offline visit is allowed to replay what it holds rather
     * than draw a new recording it cannot download.
     *
     * The replay is a different recording of the same park, so the strip's
     * "recording N of M" is corrected through the active-replay store; the
     * seed is untouched and the next online visit draws fresh as always.
     */
    const loadParkAudio = useCallback(async (parkName: string, isCurrent: () => boolean) => {
        const soundPathList = pickSoundPath(parkName, stateParks, navigator.userAgent);
        if (!soundPathList) {
            if (isCurrent()) {
                setPathError(`No valid sound path is configured for "${parkName}".`);
            }
            return;
        }

        if (isCurrent()) {
            setPathError(null);
            clearActiveReplay(parkName);
            audioActionsRef.current.clearLoadError();
        }

        const result = await audioActionsRef.current.loadBuffers(soundPathList);
        if (result !== "error" || !isCurrent()) {
            return;
        }

        const held = await findCachedVariantForPark(parkName);
        if (!held || !isCurrent()) {
            return;
        }
        if (held[0] === soundPathList[0] && held[1] === soundPathList[1]) {
            // The seeded recording is the held one; the seam's cache fallback
            // already served it. A second load could only race the first.
            return;
        }

        const variants = getParkAudioVariants(parkName, stateParks, navigator.userAgent);
        const heldNumber = variants
            ? variants.findIndex((variant) => variant[0] === held[0] && variant[1] === held[1]) + 1
            : 0;
        if (heldNumber > 0) {
            setActiveReplay(parkName, heldNumber);
        }
        audioActionsRef.current.clearLoadError();
        await audioActionsRef.current.loadBuffers(held);
    }, []);

    useEffect(() => {
        let isCurrent = true;
        setShouldAutoPlay(true);
        setAllowManualRestart(false);

        void loadParkAudio(parkName, () => isCurrent);

        return () => {
            isCurrent = false;
            // Cancel the load, but do not stop playback. The tracking hook
            // stops audio on the parkName transition, which is the real event.
            audioActionsRef.current.cancelPendingLoad();
            audioActionsRef.current.clearLoadError();
            clearActiveReplay(parkName);
        };
    }, [parkName, loadParkAudio]);

    useEffect(() => {
        if (!shouldAutoPlay || !isAudioUnlocked || isLoading || isPlaying || activeError || buffers === null) {
            return;
        }

        playSound();
        setShouldAutoPlay(false);
        setAllowManualRestart(false);
    }, [activeError, buffers, isAudioUnlocked, isLoading, isPlaying, playSound, shouldAutoPlay]);

    useEffect(() => {
        if (!window.__audioDebug) {
            return;
        }

        window.__audioDebug.uiStatus = audioStatus;
    }, [audioStatus]);

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

    const loadingLabel = audioStatus === "initializing"
        ? audioCopy.loading.initializing
        : audioStatus === "preparing"
            ? audioCopy.loading.preparing
            : audioStatus === "ready"
                ? audioCopy.loading.ready
                : null;

    /**
     * What a screen-reader user is told about the audio.
     *
     * The visible status label carries this for sighted users, but its
     * The visible strip omits this label to leave room for the controls, so
     * audio state needs its own live region. Someone walking with VoiceOver or
     * TalkBack should still hear when a park starts, stops, or fails.
     *
     * Only the states worth interrupting for. "ready" and "approaching" are
     * deliberately silent: they change often and say nothing actionable, and a
     * live region that chatters is one people turn off.
     */
    const audioAnnouncement = (() => {
        switch (audioStatus) {
            case "error":
                return audioCopy.announcement.error;
            case "preparing":
                return audioCopy.announcement.preparing;
            case "playing":
                return audioCopy.announcement.playing;
            case "interrupted":
                return audioCopy.announcement.interrupted;
            case "ready-manual":
                return allowManualRestart
                    ? audioCopy.announcement.stopped
                    : audioCopy.announcement.ready;
            default:
                return "";
        }
    })();
    const showLoadingIndicator = !activeError && loadingLabel !== null;

    const retryLoading = useCallback(() => {
        setPathError(null);
        setShouldAutoPlay(true);
        clearLoadError();
        cancelPendingLoad();
        // The same load-with-fallback as entry: a retry with no signal walks
        // into the held recording rather than failing twice at the same URL.
        void loadParkAudio(parkName, () => true);
    }, [cancelPendingLoad, clearLoadError, loadParkAudio, parkName]);

    return (
        <div id="secSource">
            <p className="sr-only" data-testid="audio-announcement" role="status" aria-live="polite">
                {audioAnnouncement}
            </p>

            <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">

                {activeError && (
                    <div className="max-w-sm rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 shadow-sm">
                        <p className="font-semibold">{audioCopy.error.title}</p>
                        <p className="mt-1">{audioCopy.error.detail}</p>
                        {/*
                          * The exception itself is deliberately not here. It
                          * cannot be acted on by someone standing in a park, and
                          * a stack of technical text reads as a crash rather
                          * than a retryable download. It still reaches the
                          * console and the debug panel, which is where anyone
                          * who can use it is looking.
                          */}
                        {isDebugEnabled() && (
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-xs text-rose-800">{activeError}</pre>
                        )}
                        <button
                            onClick={retryLoading}
                            className="mt-3 inline-flex items-center rounded-full border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 shadow-sm"
                        >
                            {audioCopy.error.retry}
                        </button>
                    </div>
                )}

                {spatialDegradation && !activeError && (
                    <p
                        className="w-full font-space-mono text-[10px] uppercase tracking-widest text-amber-800"
                        role="status"
                        data-testid="spatial-degraded-note"
                    >
                        {spatialDegradation.reason === "downmixed"
                            ? audioCopy.degraded.downmixed
                            // There is no plain mix in this branch. The
                            // collapsed spatial buffer is all there is.
                            : audioCopy.degraded.noFallback}
                    </p>
                )}

                {!activeError && (
                    <div className="flex flex-wrap items-center gap-2">
                        {showLoadingIndicator && (
                            <div
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-900/15 bg-white/35 px-4 py-2 font-space-mono text-[10px] uppercase tracking-[0.18em] text-neutral-900/70"
                                aria-live="polite"
                            >
                                <span
                                    className={`inline-block h-2 w-2 rounded-full ${
                                        audioStatus === "ready" ? "bg-emerald-700/70" : "animate-pulse bg-neutral-900/55"
                                    }`}
                                    aria-hidden="true"
                                />
                                <span>{loadingLabel}</span>
                            </div>
                        )}

                        {isPlaying && !needsAudioResume && (
                            <button
                                onClick={onTogglePlayback}
                                aria-label={audioCopy.stopAriaLabel}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
                            >
                                <StopCircleIcon className="h-4 w-4" aria-hidden="true" />
                                <span>{audioCopy.stop}</span>
                            </button>
                        )}

                        {needsAudioResume && (
                            <button
                                onClick={() => { void resumeInterruptedAudio(); }}
                                aria-label={audioCopy.resumeAriaLabel}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
                            >
                                <span>{audioCopy.resume}</span>
                            </button>
                        )}

                        {showFallbackStart && (
                            <button
                                onClick={onTogglePlayback}
                                aria-label={audioCopy.startAriaLabel}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-neutral-900/30 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-white/30"
                            >
                                <span>{audioCopy.start}</span>
                            </button>
                        )}
                    </div>
                )}

                {/*
                  * Sits with the playing state rather than in the Help modal,
                  * because a silenced phone is discovered while standing in a
                  * park and the strip is what is being read there. It cannot
                  * be detected, so it appears briefly when playback starts
                  * rather than pretending to know the phone is muted. See
                  * rl-d2a and rl-krc.
                  *
                  * After the controls, not before. Above them it took a full
                  * width row out of the strip, pushed Stop down, and read as
                  * a label for the button rather than a note about the sound.
                  */}
                {showSilenceHint && (
                    <p
                        className="w-full font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70"
                        data-testid="silence-hint"
                    >
                        {audioCopy.silence[platform]}
                    </p>
                )}

                {isPlaying && rotationActive && (
                    <GimbalArrow
                        permissionGranted={permissionGranted}
                        onPermissionGranted={onPermissionGranted}
                        onOrientationUnavailable={onOrientationUnavailable}
                        hideUI
                    />
                )}
            </div>
        </div>
    );
}

export default HOARenderer;
