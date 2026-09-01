import { useCallback, useEffect, useSyncExternalStore } from "react";
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

/**
 * The attribute stylesheets read to find out whether the walk is calmed.
 *
 * "calm" or "full", and authoritative once set: the value already folds the
 * walker's explicit choice and the system setting together in the right
 * precedence, so a stylesheet does not have to.
 */
export const MOTION_ATTRIBUTE = "data-motion";

/**
 * Publish the effective preference to the document element, so CSS can see it.
 *
 * A media query cannot. It only knows the system setting, and the whole point
 * of this preference is that a walker's explicit choice beats the system in
 * both directions. So everything expressed in CSS was deaf to the switch in
 * the Help modal: the rotation affordance kept breathing, the playing dot kept
 * pulsing, the modal transitions kept running, and so did the global duration
 * override that index.css applies on purpose. Only the layers that read this
 * value in JavaScript ever calmed down, which is why the existing specs passed
 * while the switch did half of nothing.
 *
 * Call once, at the root. The media query blocks are still there, scoped to
 * :root:not([data-motion]), because they are what covers the frames before
 * this effect first runs.
 */
export function useReduceVisualsAttribute(): void {
    const reduceVisuals = useReduceVisuals();

    useEffect(() => {
        document.documentElement.setAttribute(
            MOTION_ATTRIBUTE,
            reduceVisuals ? "calm" : "full"
        );
    }, [reduceVisuals]);
}
