import { useState } from "react";

interface GeolocationDebugPanelProps {
    position: [number, number] | null;
    parkName: string;
    debugPermission: string;
    audioState: string;
    isLoading: boolean;
    isPlaying: boolean;
    hasSourceNode: boolean;
    hasBuffers: boolean;
    bufferDuration: number | null;
    bufferChannels: number | null;
    loadError: string | null;
}

export default function GeolocationDebugPanel({
    position,
    parkName,
    debugPermission,
    audioState,
    isLoading,
    isPlaying,
    hasSourceNode,
    hasBuffers,
    bufferDuration,
    bufferChannels,
    loadError,
}: GeolocationDebugPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div className="pointer-events-auto fixed bottom-3 left-3 z-20 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-black/10 bg-white/92 p-3 text-[11px] leading-4 text-slate-700 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="font-semibold uppercase tracking-[0.2em] text-slate-500">Audio Debug</p>
                    <p className="text-xs text-slate-900">{window.location.pathname}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCollapsed((current) => !current)}
                    className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600"
                >
                    {isCollapsed ? "Open" : "Hide"}
                </button>
            </div>

            {!isCollapsed && (
                <div className="mt-3 space-y-2">
                    <p><span className="font-semibold text-slate-900">Context:</span> {audioState}</p>
                    <p><span className="font-semibold text-slate-900">Loading:</span> {isLoading ? "yes" : "no"}</p>
                    <p><span className="font-semibold text-slate-900">Playing flag:</span> {isPlaying ? "yes" : "no"}</p>
                    <p><span className="font-semibold text-slate-900">Source node:</span> {hasSourceNode ? "present" : "missing"}</p>
                    <p><span className="font-semibold text-slate-900">Buffers:</span> {hasBuffers ? "loaded" : "empty"}</p>
                    <p><span className="font-semibold text-slate-900">Duration:</span> {bufferDuration ? `${bufferDuration.toFixed(2)} s` : "n/a"}</p>
                    <p><span className="font-semibold text-slate-900">Channels:</span> {bufferChannels ?? "n/a"}</p>
                    <p><span className="font-semibold text-slate-900">Geo permission:</span> {debugPermission}</p>
                    <p><span className="font-semibold text-slate-900">Coords:</span> {position ? `${position[1].toFixed(5)}, ${position[0].toFixed(5)}` : "waiting"}</p>
                    <p><span className="font-semibold text-slate-900">Park:</span> {parkName || "none"}</p>
                    {loadError && (
                        <div className="rounded-xl bg-rose-50 px-2 py-2 text-[10px] text-rose-700">
                            <span className="font-semibold">Load error:</span> {loadError}
                        </div>
                    )}
                    {!loadError && (
                        <div className="rounded-xl bg-slate-100 px-2 py-2 text-[10px] text-slate-600">
                            If sound fails, check whether the context is `suspended`, buffers are empty, or the source node never appears after tapping play.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
