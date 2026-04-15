import { useCallback } from "react";
import { fromLonLat, getPointResolution } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector } from "rlayers";
import { useOL } from "rlayers";

import { mapRange } from "../utils/math";
import { PREFETCH_DISTANCE } from "../utils/parkSelection";

type Coordinate = [number, number];

interface PrefetchPark {
    coords: Coordinate;
    distance: number;
}

interface ProximityRingLayerProps {
    parks: PrefetchPark[];
    active: boolean; // true when any park is in prefetch range AND user hasn't entered yet
    enterDistance: number; // geographic radius (meters) of the boundary circle — rings pulse from its edge
}

export default function ProximityRingLayer({ parks, active, enterDistance }: ProximityRingLayerProps) {
    const { map } = useOL();

    const handlePostrender = useCallback((event: RenderEvent) => {
        if (!active || !parks.length || !map) {
            return;
        }

        if (!(event.context instanceof CanvasRenderingContext2D)) {
            return;
        }

        const ctx = event.context;
        const dpr = event.frameState?.pixelRatio ?? window.devicePixelRatio ?? 1;
        const view = map.getView();
        const projection = view.getProjection();
        const viewResolution = view.getResolution() ?? 1;
        const t = Date.now() / 1000;

        ctx.save();
        for (const { coords, distance } of parks) {
            const projectedCoords = fromLonLat(coords);
            const pixel = map.getPixelFromCoordinate(projectedCoords);
            if (!pixel) continue;

            const cx = pixel[0] * dpr;
            const cy = pixel[1] * dpr;
            const pointResolution = getPointResolution(projection, viewResolution, projectedCoords);
            const boundaryRadius = enterDistance / pointResolution;

            const speed = mapRange(distance, PREFETCH_DISTANCE, 5, 0.18, 1.4);
            const maxAlpha = mapRange(distance, PREFETCH_DISTANCE, 5, 0.12, 0.65);
            const phases = [(t * speed) % 1, (t * speed + 0.5) % 1];

            for (const phase of phases) {
                const radius = (boundaryRadius + phase * 24) * dpr;
                const alpha = maxAlpha * (1 - phase);

                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                ctx.strokeStyle = `rgba(168, 8, 116, ${alpha.toFixed(3)})`;
                ctx.lineWidth = 2 * dpr;
                ctx.stroke();
            }
        }
        ctx.restore();

        event.target?.changed();
    }, [active, parks, enterDistance, map]);

    return (
        <RLayerVector
            zIndex={11}
            onPostRender={handlePostrender}
        />
    );
}
