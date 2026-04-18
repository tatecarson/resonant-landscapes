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
    const renderDebugEntries = Object.entries(window.__renderDebug ?? {}).sort((a, b) => {
        return b[1].lastRenderedAt - a[1].lastRenderedAt;
    });

    return (
        <div className="pointer-events-auto fixed bottom-3 left-3 z-20 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.6rem] border border-[#23463a]/15 bg-[#f6f1e7]/78 p-3 text-[11px] leading-4 text-[#35574c] shadow-[0_18px_45px_rgba(16,33,29,0.16)] backdrop-blur-md">
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#23463a]/20 to-transparent" />
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-space-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-[#6a8276]">Field Console</p>
                    <p className="truncate font-cormorant text-xl italic leading-none text-[#17312a]">{window.location.pathname}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCollapsed((current) => !current)}
                    className="rounded-full border border-[#23463a]/15 bg-white/45 px-3 py-1.5 font-space-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#35574c] transition hover:border-[#23463a]/30 hover:bg-white/65"
                >
                    {isCollapsed ? "Open" : "Hide"}
                </button>
            </div>

            {!isCollapsed && (
                <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-white/42 px-3 py-2">
                            <p className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Context</p>
                            <p className="mt-1 font-semibold text-[#17312a]">{audioState}</p>
                        </div>
                        <div className="rounded-2xl bg-white/42 px-3 py-2">
                            <p className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Park</p>
                            <p className="mt-1 font-semibold text-[#17312a]">{parkName || "none"}</p>
                        </div>
                    </div>
                    <div className="rounded-[1.2rem] border border-[#23463a]/10 bg-white/38 px-3 py-3">
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Unlocked</span>
                            <span className="font-semibold text-[#17312a]">{isAudioUnlocked ? "yes" : "no"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Loading</span>
                            <span className="font-semibold text-[#17312a]">{isLoading ? "yes" : "no"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Playing</span>
                            <span className="font-semibold text-[#17312a]">{isPlaying ? "yes" : "no"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">UI</span>
                            <span className="font-semibold text-[#17312a]">{window.__audioDebug?.uiStatus ?? "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Source</span>
                            <span className="font-semibold text-[#17312a]">{hasSourceNode ? "present" : "missing"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Buffers</span>
                            <span className="font-semibold text-[#17312a]">{hasBuffers ? "loaded" : "empty"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Duration</span>
                            <span className="font-semibold text-[#17312a]">{bufferDuration ? `${bufferDuration.toFixed(2)} s` : "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Channels</span>
                            <span className="font-semibold text-[#17312a]">{bufferChannels ?? "n/a"}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Geo</span>
                            <span className="font-semibold text-[#17312a]">{debugPermission}</span>
                            <span className="font-space-mono text-[9px] uppercase tracking-[0.22em] text-[#6a8276]">Coords</span>
                            <span className="font-semibold text-[#17312a]">{position ? `${position[1].toFixed(5)}, ${position[0].toFixed(5)}` : "waiting"}</span>
                        </div>
                    </div>
                    {!isAudioUnlocked && (
                        <button
                            type="button"
                            onClick={() => {
                                void unlockAudio();
                            }}
                            className="rounded-full border border-[#23463a]/15 bg-[#23463a] px-3 py-2 font-space-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f6f1e7] transition hover:bg-[#17312a]"
                        >
                            Unlock Audio
                        </button>
                    )}
                    {renderDebugEntries.length > 0 && (
                        <div className="rounded-[1.2rem] bg-[#dbe5de]/72 px-3 py-3 text-[10px] text-[#35574c]">
                            <p className="font-space-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-[#6a8276]">Render counts</p>
                            <div className="mt-1 space-y-1">
                                {renderDebugEntries.map(([name, entry]) => (
                                    <p key={name}>
                                        <span className="font-semibold text-[#17312a]">{name}:</span>{" "}
                                        {entry.renderCount}
                                        {entry.changedKeys.length > 0 ? ` (${entry.changedKeys.join(", ")})` : ""}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}
                    {loadError && (
                        <div className="rounded-[1.2rem] bg-[#f7ddd5] px-3 py-3 text-[10px] text-[#8f4129]">
                            <span className="font-semibold">Load error:</span> {loadError}
                        </div>
                    )}
                    {lastUnlockError && (
                        <div className="rounded-[1.2rem] bg-[#f3e6c4] px-3 py-3 text-[10px] text-[#7c6221]">
                            <span className="font-semibold">Unlock error:</span> {lastUnlockError}
                        </div>
                    )}
                    {!loadError && (
                        <div className="rounded-[1.2rem] bg-[#dbe5de]/72 px-3 py-3 text-[10px] text-[#35574c]">
                            If sound fails, check whether the context is `suspended`, the audio is unlocked, buffers are empty, or the source node never appears after playback starts.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
