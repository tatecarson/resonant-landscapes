import { useCallback } from "react";
import { fromLonLat } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector, useOL } from "rlayers";

import { mapRange } from "../utils/math";

type Coordinate = [number, number];

interface ProximityMarkersProps {
    parkCoords: Coordinate;   // [lon, lat] of the active park center
    parkDistance: number;     // meters from user to park center
    active: boolean;          // true when user is inside the park (≤15m) AND parkDistance > 2 (AmbientGradient not yet active)
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

        // mapRange clamps parkDistance outside the 2–15m speed band (parkDistance can be 0–18),
        // so 15→2 meters maps to 1.5→6.0 rad/s, values >15 stay at the minimum 1.5,
        // and values <2 stay at the maximum 6.0 for safe, predictable behavior.
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
