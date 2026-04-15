import { useCallback } from "react";
import { fromLonLat } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector, useOL } from "rlayers";

type Coordinate = [number, number];

interface PrefetchPark {
    coords: Coordinate;
    distance: number;
}

interface SunRayLayerProps {
    parks: PrefetchPark[];
    active: boolean;
}

const RAY_COUNT = 12;
const RAY_STAGGER_S = 0.23;       // seconds between each ray's phase start
const BASE_CYCLE_S = 2.8;         // cycle duration at max distance
const MIN_CYCLE_S = 0.7;          // cycle duration at closest approach
const PREFETCH_DISTANCE = 40;     // meters — matches parkSelection constant

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
    return outMin + t * (outMax - outMin);
}

export default function SunRayLayer({ parks, active }: SunRayLayerProps) {
    const { map } = useOL();

    const handlePostrender = useCallback((event: RenderEvent) => {
        if (!active || !parks.length || !map) return;
        if (!(event.context instanceof CanvasRenderingContext2D)) return;

        const ctx = event.context;
        const dpr = event.frameState?.pixelRatio ?? window.devicePixelRatio ?? 1;
        const now = Date.now() / 1000;

        ctx.save();

        for (const { coords, distance } of parks) {
            const projectedCoords = fromLonLat(coords);
            const pixel = map.getPixelFromCoordinate(projectedCoords);
            if (!pixel) continue;

            const cx = pixel[0] * dpr;
            const cy = pixel[1] * dpr;

            // Faster pulse as user closes in
            const cycleS = mapRange(distance, PREFETCH_DISTANCE, 5, BASE_CYCLE_S, MIN_CYCLE_S);

            for (let i = 0; i < RAY_COUNT; i++) {
                const angleDeg = i * 30;
                const angleRad = (angleDeg * Math.PI) / 180;
                const cos = Math.cos(angleRad);
                const sin = Math.sin(angleRad);

                // Each ray has its own phase offset, creating the ripple stagger
                const phase = ((now + i * RAY_STAGGER_S) % cycleS) / cycleS; // 0→1

                // Smooth ease-in-out using cosine
                const eased = (1 - Math.cos(phase * 2 * Math.PI)) / 2; // 0→1→0

                // ── Inner ray: r 18→52, dash "4 4", dashoffset 0→-18 ─────────
                const innerR1 = 18 * dpr;
                const innerR2 = 52 * dpr;
                const innerDashOffset = -eased * 18 * dpr;
                const innerAlpha = 0.55 + eased * 0.35; // 0.55→0.90

                ctx.beginPath();
                ctx.moveTo(cx + cos * innerR1, cy + sin * innerR1);
                ctx.lineTo(cx + cos * innerR2, cy + sin * innerR2);
                ctx.strokeStyle = `rgba(29, 158, 117, ${innerAlpha.toFixed(3)})`;
                ctx.lineWidth = 1.4 * dpr;
                ctx.setLineDash([4 * dpr, 4 * dpr]);
                ctx.lineDashOffset = innerDashOffset;
                ctx.stroke();

                // ── Outer ray: r 54→80, dash "3 5", dashoffset 0→-14 ─────────
                const outerR1 = 54 * dpr;
                const outerR2 = 80 * dpr;
                const outerDashOffset = -eased * 14 * dpr;
                const outerAlpha = 0.25 + eased * 0.25; // 0.25→0.50

                ctx.beginPath();
                ctx.moveTo(cx + cos * outerR1, cy + sin * outerR1);
                ctx.lineTo(cx + cos * outerR2, cy + sin * outerR2);
                ctx.strokeStyle = `rgba(29, 158, 117, ${outerAlpha.toFixed(3)})`;
                ctx.lineWidth = 0.8 * dpr;
                ctx.setLineDash([3 * dpr, 5 * dpr]);
                ctx.lineDashOffset = outerDashOffset;
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
        ctx.restore();

        event.target?.changed();
    }, [active, parks, map]);

    return (
        <RLayerVector
            zIndex={11}
            onPostRender={handlePostrender}
        />
    );
}
