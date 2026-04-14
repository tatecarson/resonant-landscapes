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

        // Speed increases as user gets closer (15m → 2m maps to 0.8 → 3.5 rad/s)
        const speed = mapRange(parkDistance, 15, 2, 0.8, 3.5);

        // Halo radius breathes: 8 ± 6 screen pixels (scaled by dpr)
        const radius = (8 + Math.sin(t * speed) * 6) * dpr;

        // Alpha breathes in sync: 0.4 → 0.7
        const alpha = 0.4 + 0.25 * Math.sin(t * speed);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(142, 205, 192, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2.5 * dpr;
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
