import { useEffect, useRef } from "react";

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

export default function AmbientGradient({ active, headingRadians }: AmbientGradientProps) {
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!divRef.current) {
            return;
        }

        if (!active) {
            divRef.current.style.backgroundImage = "";
            return;
        }

        divRef.current.style.backgroundImage = getAmbientGradient(headingRadians);
    }, [active, headingRadians]);

    return (
        <div
            ref={divRef}
            data-testid="ambient-gradient"
            aria-hidden="true"
            className={`fixed inset-0 pointer-events-none transition-opacity duration-700 ${
                active ? "opacity-100" : "opacity-0"
            }`}
            style={{ zIndex: 40 }}
        />
    );
}
