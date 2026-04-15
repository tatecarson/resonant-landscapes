import { useCallback } from "react";
import { fromLonLat, getPointResolution } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector, useOL } from "rlayers";

type Coordinate = [number, number];

interface ParkGlowLayerProps {
    parks: { name: string; coords: Coordinate }[];
    glowRadius?: number;       // meters — gradient fades to transparent at this radius
    activeParkName?: string;   // fades the glow out as user walks inside
    activeParkDistance?: number; // meters, Math.floor'd
}

export default function ParkGlowLayer({
    parks,
    glowRadius = 25,
    activeParkName,
    activeParkDistance,
}: ParkGlowLayerProps) {
    const { map } = useOL();

    const handlePostrender = useCallback((event: RenderEvent) => {
        if (!parks.length || !map) return;
        if (!(event.context instanceof CanvasRenderingContext2D)) return;

        const ctx = event.context;
        const dpr = event.frameState?.pixelRatio ?? window.devicePixelRatio ?? 1;
        const view = map.getView();
        const projection = view.getProjection();
        const viewResolution = view.getResolution() ?? 1;

        ctx.save();
        for (const { name, coords } of parks) {
            const projectedCoords = fromLonLat(coords);
            const pixel = map.getPixelFromCoordinate(projectedCoords);
            if (!pixel) continue;

            const cx = pixel[0] * dpr;
            const cy = pixel[1] * dpr;
            const pointResolution = getPointResolution(projection, viewResolution, projectedCoords);
            const radiusPx = (glowRadius / pointResolution) * dpr;

            // Fade from 0.5 → 0 as user walks from 15m to center
            const isActive = name === activeParkName && activeParkDistance !== undefined;
            const peakOpacity = isActive
                ? 0.5 * Math.min(1, activeParkDistance! / 15)
                : 0.5;

            if (peakOpacity <= 0) continue;

            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
            gradient.addColorStop(0, `rgba(50, 93, 9, ${peakOpacity.toFixed(3)})`);
            gradient.addColorStop(1, "rgba(50, 93, 9, 0)");

            ctx.beginPath();
            ctx.arc(cx, cy, radiusPx, 0, 2 * Math.PI);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        ctx.restore();
    }, [parks, glowRadius, activeParkName, activeParkDistance, map]);

    return <RLayerVector zIndex={8} onPostRender={handlePostrender} />;
}
