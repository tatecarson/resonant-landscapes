import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function readPreference() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia(QUERY).matches;
}

/**
 * Whether the walker has asked their device to reduce motion.
 *
 * A CSS media query covers the CSS animations, but not the canvas layers that
 * draw their own pulses, the compass-driven gradient that is set from
 * JavaScript, or the map's zoom animation — so those read the same preference
 * from here.
 *
 * Reactive to changes: iOS and Android both expose this as a system toggle a
 * walker might flip mid-walk, precisely because something on screen has
 * started bothering them.
 */
export function usePrefersReducedMotion() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPreference);

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return;
        }

        const mediaQuery = window.matchMedia(QUERY);
        const handleChange = (event: MediaQueryListEvent) => {
            setPrefersReducedMotion(event.matches);
        };

        // Re-read on mount: the preference can change between the initial
        // useState and this effect running.
        setPrefersReducedMotion(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);

        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    return prefersReducedMotion;
}
