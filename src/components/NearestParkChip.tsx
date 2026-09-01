import { memo } from "react";

import { bearingDegrees, compassPoint, distanceInMeters, type Coordinate } from "../utils/geo";
import { wayfinding } from "../copy";

interface NearestParkChipProps {
    /** The walker, in lon/lat. Null until the first fix arrives. */
    userLonLat: Coordinate | null;
    parks: { name: string; scaledCoords: Coordinate }[];
    heardParks: ReadonlySet<string>;
    /**
     * False while a park strip is on screen. The two share the bottom of the
     * display, and a walker standing in a park does not need to be told where
     * the nearest one is.
     */
    active: boolean;
}

/**
 * Where to go next, for the walker who cannot see anywhere to go.
 *
 * Outside prefetch range the map showed a dot on an empty ground: no
 * indication that there was another park, how far it was, or which way. That
 * is the state a walk spends most of its time in, and it is the state in
 * which someone gives up and goes home.
 *
 * Deliberately not a route or an arrow that turns with the phone. A bearing
 * and a distance are enough to set off with, and they do not need the
 * orientation permission that the rotation feature has to ask for.
 */
function NearestParkChip({ userLonLat, parks, heardParks, active }: NearestParkChipProps) {
    if (!active || !userLonLat || parks.length === 0) return null;

    let nearest = parks[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const park of parks) {
        const distance = distanceInMeters(userLonLat, park.scaledCoords);
        if (distance < nearestDistance) {
            nearest = park;
            nearestDistance = distance;
        }
    }

    const point = compassPoint(bearingDegrees(userLonLat, nearest.scaledCoords));
    const meters = Math.round(nearestDistance);
    const heard = parks.reduce((count, park) => count + (heardParks.has(park.name) ? 1 : 0), 0);
    const everyParkHeard = heard === parks.length;

    return (
        <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            data-testid="nearest-park-chip"
        >
            <div className="pointer-events-auto flex max-w-full flex-col items-center gap-0.5 rounded-2xl bg-[#8ecdc0] px-4 py-2.5 shadow-[0_6px_20px_rgba(23,43,36,0.22)]">
                <p
                    className="flex max-w-full items-baseline font-space-mono text-[11px] uppercase tracking-[0.16em] text-neutral-900/80"
                    data-testid="nearest-park-line"
                    // The visible text abbreviates the compass point, which a
                    // screen reader would spell out letter by letter.
                    aria-label={wayfinding.nearestAriaLabel(
                        nearest.name,
                        meters,
                        wayfinding.spokenPoints[point]
                    )}
                >
                    <span className="min-w-0 truncate">{nearest.name}</span>
                    <span className="flex-none">{wayfinding.nearestMetrics(meters, point)}</span>
                </p>
                <p
                    className="font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/55"
                    data-testid="heard-count"
                >
                    {everyParkHeard ? wayfinding.allHeard : wayfinding.heardCount(heard, parks.length)}
                </p>
            </div>
        </div>
    );
}

export default memo(NearestParkChip);
