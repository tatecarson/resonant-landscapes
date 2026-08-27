import { useEffect, useRef, useState } from "react";
import {
    createPlaybackWakeLockController,
    type PlaybackWakeLockController,
    type WakeLockStatus,
} from "../audio/playbackWakeLock";

export function usePlaybackWakeLock(desired: boolean) {
    const wakeLock = navigator.wakeLock;
    const supported = typeof wakeLock?.request === "function";
    const [status, setStatus] = useState<WakeLockStatus>("inactive");
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<PlaybackWakeLockController | null>(null);

    useEffect(() => {
        if (!supported || !wakeLock) {
            controllerRef.current = null;
            return;
        }

        const controller = createPlaybackWakeLockController({
            request: () => wakeLock.request("screen"),
            getVisibilityState: () => document.visibilityState,
            onStatusChange: setStatus,
            onError: setError,
        });
        controllerRef.current = controller;

        const handleVisibilityChange = () => controller.handleVisibilityChange();
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            controllerRef.current = null;
            controller.dispose();
        };
    }, [supported, wakeLock]);

    useEffect(() => {
        controllerRef.current?.setDesired(desired);
    }, [desired]);

    return { supported, status, error };
}
