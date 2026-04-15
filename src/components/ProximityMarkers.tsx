import { useCallback } from "react";
import { fromLonLat } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector, useOL } from "rlayers";

type Coordinate = [number, number];

interface ProximityMarkersProps {
    parkCoords: Coordinate;   // [lon, lat] of the active park center
    parkDistance: number;     // meters from user to park center
    active: boolean;          // true when user is inside the park (≤15m) AND parkDistance > 2 (AmbientGradient not yet active)
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
    return outMin + t * (outMax - outMin);
}

export default function ProximityMarkers({ parkCoords, parkDistance, active }: ProximityMarkersProps) {
    const { map } = useOL();

    const handlePostrender = useCallback((event: RenderEvent) => {
        if (!active || !map) return;
        if (!(event.context instanceof CanvasRenderingContext2D)) return;

        const ctx = event.context;
        const dpr = event.frameState?.pixelRatio ?? window.devicePixelRatio ?? 1;
        const t = Date.now() / 1000;

        const projectedCoords = fromLonLat(parkCoords);
        const pixel = map.getPixelFromCoordinate(projectedCoords);
        if (!pixel) return;

        const cx = pixel[0] * dpr;
        const cy = pixel[1] * dpr;

        // Speed increases as user gets closer (15m → 2m maps to 1.5 → 6.0 rad/s)
        // At 1.5 rad/s period ≈ 4.2s (one slow breath), at 6.0 rad/s period ≈ 1.0s (rapid pulse)
        const speed = mapRange(parkDistance, 15, 2, 1.5, 6.0);

        const phase = Math.sin(t * speed);

        // Radius breathes: 10 ± 8 screen pixels (range 2–18px)
        const radius = (10 + phase * 8) * dpr;

        // Alpha pulses from near-invisible to 0.7 — heartbeat feel rather than hovering
        const alpha = 0.15 + 0.275 * (phase + 1); // 0.15 at min, 0.70 at max

        // Line grows thicker as user closes in
        const lineWidth = mapRange(parkDistance, 15, 2, 2, 4) * dpr;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, radius), 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(209, 122, 34, ${alpha.toFixed(3)})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.restore();

        event.target?.changed();
    }, [active, parkCoords, parkDistance, map]);

    return (
        <RLayerVector
            zIndex={12}
            onPostRender={handlePostrender}
        />
    );
}
