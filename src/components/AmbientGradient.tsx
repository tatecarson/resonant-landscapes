import { useEffect, useRef } from 'react';

interface AmbientGradientProps {
    active: boolean;
}

export default function AmbientGradient({ active }: AmbientGradientProps) {
    const divRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        if (!active) {
            cancelAnimationFrame(rafRef.current);
            return;
        }

        const tick = () => {
            const o = window.__gimbalOrientation;
            if (o && divRef.current) {
                const yaw = Math.atan2(o.fwdX, o.fwdZ);
                // cos(yaw): 1 = north, -1 = south
                const t = (Math.cos(yaw) + 1) / 2; // 1 = north, 0 = south
                const hue = Math.round(30 + t * 190); // 30 (warm/south) → 220 (cool/north)
                divRef.current.style.background =
                    `radial-gradient(ellipse at center, hsla(${hue}, 80%, 60%, 0.75) 0%, hsla(${hue}, 70%, 55%, 0.4) 40%, transparent 80%)`;
            }
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [active]);

    return (
        <div
            ref={divRef}
            aria-hidden="true"
            className={`fixed inset-0 pointer-events-none transition-opacity duration-700 ${
                active ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ zIndex: 40 }}
        />
    );
}
