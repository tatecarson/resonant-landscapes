import { useState } from "react";
import { useAudioEngine, useAudioPlaybackState } from "../contexts/AudioContextProvider";

interface GeolocationDebugPanelProps {
    position: [number, number] | null;
    parkName: string;
    debugPermission: string;
}

export default function GeolocationDebugPanel({
    position,
    parkName,
    debugPermission,
}: GeolocationDebugPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const { audioContext, bufferSourceRef, unlockAudio } = useAudioEngine();
    const { isLoading, isPlaying, isAudioUnlocked, buffers, loadError, lastUnlockError } = useAudioPlaybackState();
    const audioBuffer = buffers && "duration" in buffers ? buffers : null;
    const audioState = audioContext?.state ?? "unavailable";
    const hasSourceNode = Boolean(bufferSourceRef.current);
    const hasBuffers = Boolean(audioBuffer);
    const bufferDuration = audioBuffer?.duration ?? null;
    const bufferChannels = audioBuffer?.numberOfChannels ?? null;
    // Read from the debug mirror rather than context: these describe the
    // buffer cache and loader, which deliberately live outside React state.
    // Cache/Event/Cache hit are what steps 3-5 of the PR #61 field test need,
    // and reading them used to require attaching Safari Web Inspector.
    const audioDebug = window.__audioDebug;
    const cacheHitLabel = audioDebug?.lastLoadCacheHit === null || audioDebug?.lastLoadCacheHit === undefined
        ? "n/a"
        : audioDebug.lastLoadCacheHit ? "yes" : "no";
    const renderDebugEntries = Object.entries(window.__renderDebug ?? {}).sort((a, b) => {
        return b[1].lastRenderedAt - a[1].lastRenderedAt;
    });

    // Anchored top-left above the park strip (z-50). It used to sit at
    // bottom-3 z-20, where the strip covered it completely whenever the user
    // was inside a park — the only time its readouts matter.
    return (
        <div className="pointer-events-auto fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.6rem] border border-edge/15 bg-ground/[78%] p-3 text-[11px] leading-4 text-ink-muted shadow-console backdrop-blur-md">
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-edge/20 to-transparent" />
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-space-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-muted">Field Console</p>
                    <p className="truncate font-cormorant text-xl italic leading-none text-ink">{window.location.pathname}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCollapsed((current) => !current)}
                    className="rounded-full border border-edge/15 bg-white/45 px-3 py-1.5 font-space-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted transition hover:border-edge/30 hover:bg-white/65"
                >
                    {isCollapsed ? "Open" : "Hide"}
                </button>
            </div>

            {!isCollapsed && (
                <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-white/[42%] px-3 py-2">
                            <p className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Context</p>
                            <p className="mt-1 font-semibold text-ink">{audioState}</p>
                        </div>
                        <div className="rounded-2xl bg-white/[42%] px-3 py-2">
                            <p className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Park</p>
                            <p className="mt-1 font-semibold text-ink">{parkName || "none"}</p>
                        </div>
                    </div>
                    <div className="rounded-[1.2rem] border border-edge/10 bg-white/[38%] px-3 py-3">
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Unlocked</span>
                            <span className="font-semibold text-ink">{isAudioUnlocked ? "yes" : "no"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Loading</span>
                            <span className="font-semibold text-ink">{isLoading ? "yes" : "no"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Playing</span>
                            <span className="font-semibold text-ink">{isPlaying ? "yes" : "no"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">UI</span>
                            <span className="font-semibold text-ink">{window.__audioDebug?.uiStatus ?? "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Source</span>
                            <span className="font-semibold text-ink">{hasSourceNode ? "present" : "missing"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Buffers</span>
                            <span className="font-semibold text-ink">{hasBuffers ? "loaded" : "empty"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Duration</span>
                            <span className="font-semibold text-ink">{bufferDuration ? `${bufferDuration.toFixed(2)} s` : "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Channels</span>
                            <span className="font-semibold text-ink">{bufferChannels ?? "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Cache</span>
                            <span className="font-semibold text-ink">{audioDebug?.cacheEntries ?? "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Event</span>
                            <span className="font-semibold text-ink">{audioDebug?.lastEvent ?? "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Cache hit</span>
                            <span className="font-semibold text-ink">{cacheHitLabel}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Geo</span>
                            <span className="font-semibold text-ink">{debugPermission}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-ink-muted">Coords</span>
                            <span className="font-semibold text-ink">{position ? `${position[1].toFixed(5)}, ${position[0].toFixed(5)}` : "waiting"}</span>
                        </div>
                    </div>
                    {!isAudioUnlocked && (
                        <button
                            type="button"
                            onClick={() => {
                                void unlockAudio();
                            }}
                            className="rounded-full border border-edge/15 bg-edge px-3 py-2 font-space-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ground transition hover:bg-ink"
                        >
                            Unlock Audio
                        </button>
                    )}
                    {renderDebugEntries.length > 0 && (
                        <div className="rounded-[1.2rem] bg-surface/[72%] px-3 py-3 text-[10px] text-ink-muted">
                            <p className="font-space-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-muted">Render counts</p>
                            <div className="mt-1 space-y-1">
                                {renderDebugEntries.map(([name, entry]) => (
                                    <p key={name}>
                                        <span className="font-semibold text-ink">{name}:</span>{" "}
                                        {entry.renderCount}
                                        {entry.changedKeys.length > 0 ? ` (${entry.changedKeys.join(", ")})` : ""}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}
                    {loadError && (
                        <div className="rounded-[1.2rem] bg-status-error-surface px-3 py-3 text-[10px] text-status-error">
                            <span className="font-semibold">Load error:</span> {loadError}
                        </div>
                    )}
                    {lastUnlockError && (
                        <div className="rounded-[1.2rem] bg-status-warning-surface px-3 py-3 text-[10px] text-status-warning">
                            <span className="font-semibold">Unlock error:</span> {lastUnlockError}
                        </div>
                    )}
                    {!loadError && (
                        <div className="rounded-[1.2rem] bg-surface/[72%] px-3 py-3 text-[10px] text-ink-muted">
                            If sound fails, check whether the context is `suspended`, the audio is unlocked, buffers are empty, or the source node never appears after playback starts.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
