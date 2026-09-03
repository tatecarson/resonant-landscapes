import { useSyncExternalStore } from "react";

/**
 * The recording that is playing when it is not the one the seed drew.
 *
 * Cache-on-use keeps recordings a walk has already fetched, and when the
 * seed's choice cannot be downloaded — no signal, thin signal — the walk
 * replays a recording it holds rather than dead-ending. The strip says
 * "recording N of M" out of the seed, so the moment a replay substitutes a
 * different recording, that sentence would quietly become false. This store
 * is the correction: the number of the recording actually playing, for the
 * park actually playing it.
 *
 * Nothing here changes what plays. It only keeps the sentence honest.
 */
let activeReplay: { parkName: string; variantNumber: number } | null = null;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

/** The walk is playing held recording `variantNumber` of `parkName`. */
export function setActiveReplay(parkName: string, variantNumber: number) {
    const next = { parkName, variantNumber };
    if (
        activeReplay?.parkName === next.parkName &&
        activeReplay.variantNumber === next.variantNumber
    ) {
        return;
    }
    activeReplay = next;
    notify();
}

/**
 * The replay record is over. Keyed by park so a stale cleanup from a park
 * being left cannot wipe a replay just recorded for the park being entered.
 */
export function clearActiveReplay(parkName: string) {
    if (activeReplay?.parkName !== parkName) return;
    activeReplay = null;
    notify();
}

/**
 * Which recording is actually playing in `parkName`, when it is not the
 * seed's choice. Null means the seed's choice is playing — the common case,
 * and the case the seed alone already describes.
 */
export function useActiveReplayVariant(parkName: string | null): number | null {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        () => (activeReplay && activeReplay.parkName === parkName ? activeReplay.variantNumber : null),
        () => null,
    );
}
