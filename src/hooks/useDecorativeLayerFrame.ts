import { useCallback, useEffect, useRef } from "react";

import {
    createDecorativeFrameScheduler,
    type Redrawable,
} from "../map/decorativeFrames";

/**
 * React wrapper around createDecorativeFrameScheduler. Returns the function to
 * call in place of `event.target.changed()` in a layer's postrender handler.
 *
 * The scheduling rules, and why they exist, live in src/map/decorativeFrames.ts.
 */
export function useDecorativeLayerFrame(active: boolean, frameMs?: number) {
    const activeRef = useRef(active);
    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    const schedulerRef = useRef<ReturnType<typeof createDecorativeFrameScheduler> | null>(null);
    if (schedulerRef.current === null) {
        schedulerRef.current = createDecorativeFrameScheduler({
            frameMs,
            isHidden: () => document.hidden,
            isActive: () => activeRef.current,
        });
    }

    useEffect(() => {
        const scheduler = schedulerRef.current;
        const handleVisibilityChange = () => scheduler?.resume();

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            scheduler?.dispose();
        };
    }, []);

    return useCallback((layer: Redrawable | null | undefined) => {
        schedulerRef.current?.request(layer);
    }, []);
}
