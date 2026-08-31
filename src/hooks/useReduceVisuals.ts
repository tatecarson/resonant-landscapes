import { useCallback, useSyncExternalStore } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const STORAGE_KEY = "reduceVisuals";

/** null means "no choice made", which is what defers to the system setting. */
type StoredPreference = boolean | null;

function readStored(): StoredPreference {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === "true") return true;
        if (raw === "false") return false;
        return null;
    } catch {
        // Private mode and blocked storage both throw. Falling back to the
        // system setting is the right answer either way.
        return null;
    }
}

/**
 * Module-level rather than per-component, because five places read this and a
 * switch in the Help modal has to move the gradient behind it. Subscriptions
 * instead of a context provider: there is one value, it changes rarely, and a
 * provider would have to wrap the whole tree to reach the map layers.
 */
let stored: StoredPreference = readStored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): StoredPreference {
    return stored;
}

export function setReduceVisualsPreference(value: StoredPreference) {
    stored = value;
    try {
        if (value === null) {
            window.localStorage.removeItem(STORAGE_KEY);
        } else {
            window.localStorage.setItem(STORAGE_KEY, String(value));
        }
    } catch {
        // Keep the in-memory value so the walk still responds this session.
    }
    for (const listener of listeners) listener();
}

/** Test seam: reset both the stored value and the in-memory copy. */
export function resetReduceVisualsPreference() {
    setReduceVisualsPreference(null);
}

/**
 * Whether to draw the calm version of the walk.
 *
 * The walker's own choice wins over the system setting when they have made
 * one, rather than being OR'd with it. Someone who has reduce-motion on
 * everywhere but wants the full visuals in this piece can have them, and the
 * system setting is still the default for everyone who never opens the modal.
 */
export function useReduceVisuals(): boolean {
    const prefersReducedMotion = usePrefersReducedMotion();
    const preference = useSyncExternalStore(subscribe, getSnapshot, () => null);
    return preference ?? prefersReducedMotion;
}

/**
 * The same value plus what the Help modal needs to explain it: whether the
 * switch is showing a choice or inheriting the phone's.
 */
export function useReduceVisualsPreference() {
    const prefersReducedMotion = usePrefersReducedMotion();
    const preference = useSyncExternalStore(subscribe, getSnapshot, () => null);

    const setReduceVisuals = useCallback(
        (value: boolean) => {
            // Choosing whatever the phone already says clears the override
            // rather than freezing that answer in. Otherwise the first tap is
            // a one-way door: there is no other control that returns to
            // following the system, so a walker who later turns reduce motion
            // on across their phone would not be followed here, and the line
            // under the switch would keep claiming an explicit choice.
            setReduceVisualsPreference(value === prefersReducedMotion ? null : value);
        },
        [prefersReducedMotion]
    );

    return {
        reduceVisuals: preference ?? prefersReducedMotion,
        followingSystem: preference === null,
        setReduceVisuals,
    };
}
