import { memo, useCallback } from "react";
import { fromLonLat, getPointResolution } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector, useOL } from "rlayers";
import { palette, withAlpha } from "../theme/palette";
import { arrivalProgress } from "../utils/arrival";

type Coordinate = [number, number];

/** Every spot on the map, and the active one at the threshold. */
const RESTING_OPACITY = 0.5;
/**
 * The active spot with the walker standing on it.
 *
 * Set against what is over it rather than against how it looks alone: by the
 * centre this is under a full-screen field at `arrivalField.core.peak`, which
 * leaves about a quarter of it showing. Raising the field means raising this
 * with it, or the last mark of where the spot is goes under the thing that is
 * supposed to be celebrating arriving at it.
 */
const ARRIVED_OPACITY = 0.95;

interface ParkGlowLayerProps {
    parks: { name: string; coords: Coordinate }[];
    glowRadius?: number;       // meters — gradient fades to transparent at this radius
    activeParkName?: string;   // brightens the glow as user walks inside
    activeParkDistance?: number; // meters, Math.floor'd
}

function ParkGlowLayer({
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
            if (
                !Number.isFinite(cx) ||
                !Number.isFinite(cy) ||
                !Number.isFinite(pointResolution) ||
                pointResolution <= 0 ||
                !Number.isFinite(radiusPx) ||
                radiusPx <= 0
            ) {
                continue;
            }

            /*
             * The active spot strengthens as the walker arrives; it used to
             * fade to nothing over the same fifteen metres.
             *
             * That fade was half of why arrival felt like a hole (rl-879): the
             * basemap now dissolves across this band and the field over it
             * grows, so a glow going out at the same time would take the last
             * mark of where the spot actually is with it. This is the answer to
             * "can the walker still find the centre once the map has gone" —
             * it is the only thing left drawing the destination, and the
             * walker's own marker on top of it is the only thing drawing them.
             */
            const isActive = name === activeParkName && activeParkDistance !== undefined;
            const peakOpacity = isActive
                ? RESTING_OPACITY +
                  (ARRIVED_OPACITY - RESTING_OPACITY) * arrivalProgress(activeParkDistance!)
                : RESTING_OPACITY;

            if (peakOpacity <= 0) continue;

            const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
            gradient.addColorStop(0, withAlpha(palette.accentSoft, peakOpacity.toFixed(3)));
            gradient.addColorStop(1, withAlpha(palette.accentSoft, 0));

            ctx.beginPath();
            ctx.arc(cx, cy, radiusPx, 0, 2 * Math.PI);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        ctx.restore();
    }, [parks, glowRadius, activeParkName, activeParkDistance, map]);

    return <RLayerVector zIndex={8} onPostRender={handlePostrender} />;
}

/**
 * Redraws on every postrender, so an unmemoised parent re-render rebuilds the
 * listener and repaints the map even when nothing this layer draws has moved.
 */
export default memo(ParkGlowLayer);
