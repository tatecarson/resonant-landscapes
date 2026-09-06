import { useEffect, useRef } from "react";

import { useReduceVisuals } from "../hooks/useReduceVisuals";
import { ambientWash } from "../theme/palette";

interface AmbientGradientProps {
    active: boolean;
    headingRadians: number;
}

function normalizeDegrees(value: number) {
    return ((value % 360) + 360) % 360;
}

/** One hue at the palette's weight, from the centre out to transparent. */
function washAt(
    hue: number,
    core: { saturation: number; lightness: number; alpha: number },
    edge: { saturation: number; lightness: number; alpha: number }
) {
    return (
        `radial-gradient(ellipse at center, ` +
        `hsla(${hue}, ${core.saturation}%, ${core.lightness}%, ${core.alpha}) 0%, ` +
        `hsla(${hue}, ${edge.saturation}%, ${edge.lightness}%, ${edge.alpha}) 40%, ` +
        `transparent 80%)`
    );
}

/**
 * The hue is the heading and nothing else: the full wheel, so that any two
 * directions are told apart. Its weight comes from the palette (ambientWash),
 * which is what stopped this being a full-screen primary sitting over a map
 * drawn entirely in muted greens — the one surface in the app that did not
 * look like the app.
 */
function getAmbientGradient(headingRadians: number) {
    const headingDegrees = normalizeDegrees((headingRadians * 180) / Math.PI);
    const hue = Math.round(normalizeDegrees(220 - headingDegrees));

    return washAt(hue, ambientWash.core, ambientWash.edge);
}

/**
 * Reduced-motion form: the same presence, none of the movement.
 *
 * The full version is a full-screen wash whose hue tracks the compass — so it
 * slides continuously while the walker turns, on a screen held at walking
 * pace. That is exactly the kind of large-area motion that provokes
 * vestibular and photosensitive responses. Holding one hue at a much lower
 * alpha keeps the "you are inside a listening area" cue without animating it.
 */
const STATIC_HUE = 220;
const REDUCED_MOTION_GRADIENT = washAt(
    STATIC_HUE,
    ambientWash.calmCore,
    ambientWash.calmEdge
);

export default function AmbientGradient({ active, headingRadians }: AmbientGradientProps) {
    const divRef = useRef<HTMLDivElement>(null);
    const prefersReducedMotion = useReduceVisuals();

    useEffect(() => {
        if (!divRef.current) {
            return;
        }

        if (!active) {
            divRef.current.style.backgroundImage = "";
            return;
        }

        divRef.current.style.backgroundImage = prefersReducedMotion
            ? REDUCED_MOTION_GRADIENT
            : getAmbientGradient(headingRadians);
    }, [active, headingRadians, prefersReducedMotion]);

    return (
        <div
            ref={divRef}
            data-testid="ambient-gradient"
            aria-hidden="true"
            className={`fixed inset-0 pointer-events-none ${
                prefersReducedMotion ? "" : "transition-opacity duration-700"
            } ${active ? "opacity-100" : "opacity-0"}`}
            style={{ zIndex: 40 }}
        />
    );
}
