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
/*
 * Whether a park has been heard since this page loaded, which is a different
 * question from whether one has ever been heard.
 *
 * The install offer asks the second question and meant the first. Persisted,
 * the set is already full on the first frame of every return visit, so the
 * offer appeared during start-up, underneath the location permission prompt,
 * and was pulled away the moment a fix arrived and a park strip took the
 * bottom of the screen. The walker saw an offer flash past that they never
 * had a chance to answer.
 */
let heardThisSession = false;
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
    if (!parkName) return;

    /*
     * The session flag is set for a park already in the record, not only for
     * a new one. Hearing a park is hearing a park; whether it was also heard
     * on some previous visit is a different fact.
     *
     * Getting this wrong broke the case it was written for. The early return
     * on a known park meant a walker coming back and hearing one they had
     * heard before never set the flag, so the install offer never appeared
     * for them: thirteen parks and a walk done more than once makes that
     * nearly everyone.
     */
    const sessionJustStarted = !heardThisSession;
    heardThisSession = true;

    if (heard.has(parkName)) {
        // Nothing to store, but the session flag changing is worth a render.
        if (sessionJustStarted) {
            for (const listener of listeners) listener();
        }
        return;
    }

    heard = new Set(heard).add(parkName);
    persist();
    for (const listener of listeners) listener();
}

/** Test seam, and what a "start the walk again" control would call. */
export function resetHeardParks() {
    heard = new Set();
    heardThisSession = false;
    persist();
    for (const listener of listeners) listener();
}

export function useHeardParks(): ReadonlySet<string> {
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/**
 * Whether the walker has heard a park since this page loaded.
 *
 * For anything that should follow the act of hearing rather than the record
 * of having heard: the install offer waits on this so it cannot appear during
 * start-up, when a permission prompt is over it and a park strip is about to
 * take its place.
 */
export function useHeardThisSession(): boolean {
    return useSyncExternalStore(subscribe, () => heardThisSession, () => false);
}
