/** ~30 fps. These layers are ambient pulses; nobody is reading them frame by frame. */
export const DECORATIVE_FRAME_MS = 33;

/** The part of an OpenLayers layer this needs: a way to ask for a redraw. */
export type Redrawable = { changed: () => void };

export type DecorativeFrameSchedulerOptions = {
    frameMs?: number;
    /** Whether the page is currently hidden. Injected so this stays testable in node. */
    isHidden: () => boolean;
    /** Whether the layer still wants to animate. */
    isActive: () => boolean;
    schedule?: (callback: () => void, delayMs: number) => number;
    cancel?: (handle: number) => void;
};

/**
 * Paces a decorative canvas layer's self-driven animation.
 *
 * These layers animate by calling `changed()` from their own postrender
 * handler, which schedules another full map redraw immediately — so an active
 * ring or sun-ray layer repaints the entire map every frame, on a phone, in a
 * pocket, for as long as the walker is near a park. Two things follow from
 * that being decorative rather than informational:
 *
 * - it can run at ~30 fps instead of 60 or 120, and
 * - it must stop entirely while the page is hidden, which is most of a walk
 *   once the screen sleeps. Audio keeps playing there; the map does not need
 *   redrawing for nobody.
 *
 * Pausing means no further postrender events arrive, so resuming cannot come
 * from the layer — `resume()` exists for a visibilitychange listener to call.
 */
export function createDecorativeFrameScheduler({
    frameMs = DECORATIVE_FRAME_MS,
    isHidden,
    isActive,
    schedule = (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancel = (handle) => window.clearTimeout(handle),
}: DecorativeFrameSchedulerOptions) {
    let handle: number | null = null;
    let layer: Redrawable | null = null;

    return {
        /** Call in place of `event.target.changed()` at the end of a postrender. */
        request(nextLayer: Redrawable | null | undefined) {
            if (!nextLayer) {
                return;
            }

            layer = nextLayer;

            // A frame is already pending, or the page is hidden and resume()
            // owns the restart.
            if (handle !== null || isHidden()) {
                return;
            }

            handle = schedule(() => {
                handle = null;
                if (!isHidden() && isActive()) {
                    layer?.changed();
                }
            }, frameMs);
        },

        /** Restart the animation after the page becomes visible again. */
        resume() {
            if (isHidden() || !isActive() || handle !== null) {
                return;
            }
            layer?.changed();
        },

        dispose() {
            if (handle !== null) {
                cancel(handle);
                handle = null;
            }
            layer = null;
        },

        /** Test seam: whether a frame is currently pending. */
        get pending() {
            return handle !== null;
        },
    };
}
