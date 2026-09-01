import { memo } from "react";

import { useOnline } from "../hooks/useOnline";
import { connection } from "../copy";

/**
 * The other half of rl-1u7.15, decided rather than left to chance.
 *
 * This one does not stand down for a modal. Losing signal is a fact about
 * the phone that stays true whatever is on screen, and the walker most
 * likely to have the field guide open is the walker trying to work out why
 * nothing is happening. Hiding the answer behind the question would be
 * exactly wrong.
 *
 * So it stays visible and stops being interactive instead. Nothing in it can
 * be pressed, so wherever it lands it cannot swallow a tap meant for a
 * control underneath. That is what went wrong with the chip: it was
 * interactive, so overlapping the close button consumed the press.
 *
 * Rendered outside the map rather than as an RControl.
 *
 * The location status uses RControl.RCustom and has to stay mounted for the
 * life of the map, because unmounting one makes rlayers throw "removeChild
 * ... is not a child of this node" straight into the error boundary around
 * the park strip. A notice that appears and disappears with the signal is
 * exactly the shape that triggers it, so it lives in ordinary DOM above the
 * map instead.
 */
function OfflineNotice() {
    const online = useOnline();

    if (online) return null;

    return (
        <div
            className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
            data-testid="offline-notice"
        >
            <div className="max-w-sm rounded-2xl bg-[#8ecdc0] px-4 py-2.5 text-center shadow-[0_6px_20px_rgba(23,43,36,0.22)]">
                <p
                    className="font-space-mono text-[11px] uppercase tracking-[0.16em] text-neutral-900/85"
                    role="status"
                    aria-live="polite"
                >
                    {connection.offline.title}
                </p>
                <p className="mt-1 font-space-mono text-[11px] leading-relaxed text-neutral-900/70">
                    {connection.offline.detail}
                </p>
            </div>
        </div>
    );
}

export default memo(OfflineNotice);
