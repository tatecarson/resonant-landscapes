import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

interface AmbientGradientProps {
    active: boolean;
    headingRadians: number;
}

function normalizeDegrees(value: number) {
    return ((value % 360) + 360) % 360;
}

function getAmbientGradient(headingRadians: number) {
    const headingDegrees = normalizeDegrees((headingRadians * 180) / Math.PI);
    const hue = Math.round(normalizeDegrees(220 - headingDegrees));

    return `radial-gradient(ellipse at center, hsla(${hue}, 80%, 60%, 0.75) 0%, hsla(${hue}, 70%, 55%, 0.4) 40%, transparent 80%)`;
}

/**
 * Reduced-motion form: the same presence, none of the movement.
 *
 * The full version is a full-screen wash at 0.75 alpha whose hue tracks the
 * compass — so it slides continuously while the walker turns, on a screen held
 * at walking pace. That is exactly the kind of large-area motion that provokes
 * vestibular and photosensitive responses. Holding one hue at a much lower
 * alpha keeps the "you are inside a listening area" cue without animating it.
 */
const STATIC_HUE = 220;
const REDUCED_MOTION_GRADIENT =
    `radial-gradient(ellipse at center, hsla(${STATIC_HUE}, 45%, 60%, 0.22) 0%, hsla(${STATIC_HUE}, 40%, 55%, 0.12) 40%, transparent 80%)`;

export default function AmbientGradient({ active, headingRadians }: AmbientGradientProps) {
    const divRef = useRef<HTMLDivElement>(null);
    const prefersReducedMotion = usePrefersReducedMotion();

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
