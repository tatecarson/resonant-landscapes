import { useSyncExternalStore } from "react";

const STORAGE_KEY = "heardParks";

/**
 * Which parks the walker has actually heard.
 *
 * "Heard" is deliberately narrower than "arrived at". A walker can cross a
 * listening area with the audio still downloading, or with it failing
 * outright, and counting that as heard would tell them they had listened to
 * something they never did. This is written when playback starts, which is
 * the first moment the claim is true.
 *
 * Module-level rather than per-component, for the same reasons as the
 * reduce-visuals preference: the map markers, the chip and the count all read
 * it, and a provider would have to wrap the whole tree to reach the layers.
 */
function readStored(): ReadonlySet<string> {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();
        // Filter rather than trust: this is the one value a walker's browser
        // hands back across sessions, and a half-written array should cost a
        // marker rather than the map.
        return new Set(parsed.filter((name): name is string => typeof name === "string"));
    } catch {
        // Private mode, blocked storage and malformed JSON all land here. An
        // empty set is the honest answer: nothing is known to have been heard.
        return new Set();
    }
}

let heard: ReadonlySet<string> = readStored();
const listeners = new Set<() => void>();
/**
 * A stable empty set for the server snapshot. Returning a fresh Set() there
 * makes useSyncExternalStore loop forever, because it compares by identity.
 */
const EMPTY: ReadonlySet<string> = new Set();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlySet<string> {
    return heard;
}

function persist() {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...heard]));
    } catch {
        // Keep the in-memory record so the walk still counts this session.
    }
}

/** Record a park as heard. No-op if it already was, so markers do not churn. */
export function markParkHeard(parkName: string) {
    if (!parkName || heard.has(parkName)) return;
    heard = new Set(heard).add(parkName);
    persist();
    for (const listener of listeners) listener();
}

/** Test seam, and what a "start the walk again" control would call. */
export function resetHeardParks() {
    heard = new Set();
    persist();
    for (const listener of listeners) listener();
}

export function useHeardParks(): ReadonlySet<string> {
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
