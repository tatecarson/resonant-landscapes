import React, { useEffect, useCallback, useRef, useState } from 'react';
import { StopCircleIcon } from '@heroicons/react/24/solid'
import { useAudioEngine, useAudioPlaybackState } from '../contexts/AudioContextProvider';
import { useRenderDebug } from "../hooks/useRenderDebug";
import GimbalArrow from './GimbalArrow';

import stateParks from '../data/stateParks.json';
import { pickSoundPath } from '../utils/audioPaths';
import { audio as audioCopy } from '../copy';
import { isDebugEnabled } from '../config/debug';

interface HOARendererProps {
    parkName: string;
    parkDistance: number;
    userOrientation: boolean;
    compact?: boolean;
    hideStatusLabel?: boolean;
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
    compact = false,
    hideStatusLabel = false,
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
        lastLoadDurationMs,
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

    useRenderDebug("HOARenderer", {
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        compact,
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
            // Cancel the load, but do not stop playback: this cleanup runs on
            // every layout unmount too (Dialog ↔ strip on rotationActive), and
            // telling playback apart from layout here needed an isMountedRef
            // guard that only approximated the question. The tracking hook
            // stops audio on the parkName transition, which is the real event.
            audioActionsRef.current.cancelPendingLoad();
            audioActionsRef.current.clearLoadError();
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

    let audioStatusLabel: string;
    let statusMessage: string;

    if (activeError) {
        audioStatusLabel = audioCopy.error.title;
        statusMessage = audioCopy.error.detail;
    } else {
        switch (audioStatus) {
            case "preparing":
                audioStatusLabel = audioCopy.label.preparing;
                statusMessage = hasPrefetchedAudio
                    ? audioCopy.message.preparingPrefetched
                    : audioCopy.message.preparingFresh;
                break;
            case "initializing":
                audioStatusLabel = audioCopy.label.initializing;
                statusMessage = audioCopy.message.initializing;
                break;
            case "playing":
                audioStatusLabel = audioCopy.label.playing;
                statusMessage = audioCopy.message.playing;
                break;
            case "interrupted":
                audioStatusLabel = audioCopy.label.interrupted;
                statusMessage = audioCopy.message.interrupted;
                break;
            case "ready-manual":
                audioStatusLabel = allowManualRestart ? audioCopy.label.stopped : audioCopy.label.readyToStart;
                statusMessage = allowManualRestart
                    ? audioCopy.message.stopped
                    : audioCopy.message.readyToStart;
                break;
            case "ready":
                audioStatusLabel = audioCopy.label.ready;
                statusMessage = audioCopy.message.ready;
                break;
            default:
                audioStatusLabel = hasPrefetchedAudio ? audioCopy.label.warming : audioCopy.label.entering;
                statusMessage = hasPrefetchedAudio
                    ? audioCopy.message.warming
                    : audioCopy.message.entering;
                break;
        }
    }
    const timingHint = lastLoadDurationMs !== null
        ? audioCopy.timingHint((lastLoadDurationMs / 1000).toFixed(1), lastLoadCacheHit === true)
        : null;
    const getCompactStatusLabel = () => {
        switch (audioStatus) {
            case "playing":
                return audioCopy.compactLabel.playing;
            case "interrupted":
                return audioCopy.compactLabel.interrupted;
            case "initializing":
                return audioCopy.compactLabel.initializing;
            case "preparing":
                return audioCopy.compactLabel.preparing;
            case "ready-manual":
                return allowManualRestart ? audioStatusLabel : audioCopy.compactLabel.tapToStart;
            default:
                return audioStatusLabel;
        }
    };
    const compactStatusLabel = getCompactStatusLabel();

    /**
     * What a screen-reader user is told about the audio.
     *
     * The visible status label carries this for sighted users, but its
     * aria-live region is behind `!(compact && hideStatusLabel)` and the strip
     * passes both — so on the real code path audio state was announced
     * nowhere. Someone walking with VoiceOver or TalkBack got no notice that a
     * park's audio had started, stopped, or failed.
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
    const showCompactLoadingIndicator = compact && hideStatusLabel && !activeError && (audioStatus === "initializing" || audioStatus === "preparing" || audioStatus === "ready");

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
            <p className="sr-only" data-testid="audio-announcement" role="status" aria-live="polite">
                {audioAnnouncement}
            </p>

            <div className={compact ? "flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3" : "space-y-4"}>
                <div className="min-w-0 space-y-1">
                    {!(compact && hideStatusLabel) && (
                        <p className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70" aria-live="polite">
                            {compact ? compactStatusLabel : audioStatusLabel}
                        </p>
                    )}
                    {!compact && !activeError && (
                        <p className="font-space-mono text-[11px] text-neutral-900/70">
                            {statusMessage}
                        </p>
                    )}
                    {!compact && !activeError && timingHint && (
                        <p className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70">
                            {timingHint}
                        </p>
                    )}
                </div>

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

                {/*
                  * The same message on every park for the life of the session,
                  * so it stays terse in the strip the walker actually carries
                  * and says the whole thing only in the expanded panel.
                  */}
                {spatialDegradation && !activeError && (
                    <p
                        className={
                            compact
                                ? "w-full font-space-mono text-[10px] uppercase tracking-widest text-amber-800"
                                : "w-full max-w-sm rounded-2xl border border-amber-300/60 bg-amber-50/80 px-3 py-2 font-space-mono text-[11px] leading-relaxed text-amber-900"
                        }
                        role="status"
                        data-testid="spatial-degraded-note"
                    >
                        {compact
                            ? spatialDegradation.reason === "downmixed"
                                ? audioCopy.degraded.compactDownmixed
                                // There is no plain mix in this branch: the
                                // collapsed spatial buffer is all there is, so
                                // promising one would be the wrong kind of wrong.
                                : audioCopy.degraded.compactNoFallback
                            : spatialDegradation.reason === "downmixed"
                                ? audioCopy.degraded.downmixed
                                : audioCopy.degraded.noFallback}
                    </p>
                )}

                {!activeError && (
                    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex items-center gap-3"}>
                        {showCompactLoadingIndicator && (
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
                                <span>{compactStatusLabel}</span>
                            </div>
                        )}

                        {isPlaying && !needsAudioResume && (
                            <button
                                onClick={onTogglePlayback}
                                aria-label={audioCopy.stopAriaLabel}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-neutral-700"
                            >
                                <StopCircleIcon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
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

                {/* GimbalArrow runs whenever rotation is active — no !compact guard so audio tracking survives modal collapse */}
                {isPlaying && rotationActive && (
                    <GimbalArrow
                        permissionGranted={permissionGranted}
                        onPermissionGranted={onPermissionGranted}
                        onOrientationUnavailable={onOrientationUnavailable}
                        hideUI={compact}
                    />
                )}
            </div>
        </div>
    );
}

export default HOARenderer;
