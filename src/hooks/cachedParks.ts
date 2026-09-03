import { useSyncExternalStore } from "react";
import { subscribeToCachedParks, getCachedParksSnapshot } from "../audio/offlineAudioCache";

/**
 * Which parks the walk holds on disk, as a React-read store.
 *
 * This is deliberately its own fact and not a third value on the heard
 * store: a park is only cached because it was fetched, but the two records
 * diverge in both directions — a prefetch can complete for a park the
 * walker never enters, and eviction can take a park the heard record still
 * counts. The markers show both, for the questions they answer: heard is
 * "you have listened here", cached is "this will play with no signal".
 */
const EMPTY: ReadonlySet<string> = new Set();

export function useCachedParks(): ReadonlySet<string> {
    return useSyncExternalStore(subscribeToCachedParks, getCachedParksSnapshot, () => EMPTY);
}
