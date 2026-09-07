import { describe, expect, it } from "vitest";

import { arrivalFieldAlphas, leanPosition } from "./ArrivalField";
import { arrivalProgress } from "../utils/arrival";
import { arrivalField } from "../theme/palette";
import { ENTER_DISTANCE_METERS, EXIT_DISTANCE_METERS } from "../config/geofence";

/**
 * The defect this field replaced was a curve that went the wrong way for six
 * metres: the approach tint switched off at the threshold and nothing took the
 * screen until three metres from the centre, so the walk was emptiest exactly
 * where it should have been fullest.
 *
 * So what is asserted here is the direction of the curve, not its shape. The
 * weights are tuning and belong in the palette; a test that pinned them would
 * fail on every walk that retuned them and would still not catch the one thing
 * that must never happen again.
 */

/**
 * The field's alpha at a distance from the centre of the screen, as a percent
 * of the closest side.
 *
 * A model of the two stops the component hands to CSS: flat at `core` out to
 * the hole, then a linear ramp to `edge` at the closest side. The gradient
 * itself is interpolated by the browser, so this is the only way to sample it
 * without a real layout — and being a model is exactly why it is written out
 * here rather than exported and shared with the thing it is checking.
 */
function alphaAt(radiusPercent: number, progress: number, reduceVisuals = false) {
    const { core, edge, hole } = arrivalFieldAlphas(progress, reduceVisuals);
    if (radiusPercent <= hole) {
        return core;
    }
    return core + (edge - core) * ((radiusPercent - hole) / (100 - hole));
}

const RADII = [0, 10, 20, 30, 38, 50, 70, 90, 100];
const WALK_IN = [15, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0];

describe("arrivalProgress", () => {
    it("runs from nothing at the threshold to everything at the centre", () => {
        expect(arrivalProgress(ENTER_DISTANCE_METERS)).toBe(0);
        expect(arrivalProgress(ENTER_DISTANCE_METERS / 2)).toBeCloseTo(0.5, 5);
        expect(arrivalProgress(0)).toBe(1);
    });

    it("sits still across the hysteresis band", () => {
        // A park opens at 15 m and closes at 18, so the three metres between
        // them are walked with the park open and the field mounted. If the
        // dissolve ran on that band it would play and reverse on every jitter
        // of a fix that carries several metres of error.
        for (let metres = ENTER_DISTANCE_METERS; metres <= EXIT_DISTANCE_METERS; metres += 0.5) {
            expect(arrivalProgress(metres)).toBe(0);
        }
    });

    it("survives a distance that is not a number", () => {
        expect(arrivalProgress(Number.NaN)).toBe(0);
    });
});

describe("the arrival field", () => {
    it("never empties as the walker closes", () => {
        for (const radius of RADII) {
            let previous = -1;
            for (const metres of WALK_IN) {
                const alpha = alphaAt(radius, arrivalProgress(metres));
                expect(
                    alpha,
                    `${radius}% out went backwards at ${metres} m`
                ).toBeGreaterThanOrEqual(previous);
                previous = alpha;
            }
        }
    });

    it("picks the screen up exactly where the approach tint puts it down", () => {
        // ProximityWarmth's WARM_ALPHA, which it is at for every metre inside
        // ENTER_DISTANCE_METERS, and the geometry either side of the handover
        // is the same closest-side bloom in the same colour. The walker cannot
        // be allowed to see the switch.
        const threshold = arrivalFieldAlphas(arrivalProgress(ENTER_DISTANCE_METERS), false);
        expect(threshold.edge).toBe(0.5);
        expect(threshold.core).toBe(0);
        expect(threshold.hole).toBe(38);
    });

    it("fills the middle of the screen by the centre", () => {
        // The approach tint keeps the middle clear so the map stays readable
        // through it. By the centre there is no map left to read.
        const arrived = arrivalFieldAlphas(1, false);
        expect(arrived.hole).toBe(0);
        expect(arrived.core).toBe(arrivalField.core.peak);
        expect(alphaAt(0, 1)).toBeGreaterThan(alphaAt(0, 0));
    });

    it("gives reduced visuals one state instead of a dissolve", () => {
        // Still marks the threshold — the field is there, and quieter — but a
        // full screen of colour growing under someone walking is the exact
        // large-area motion the setting exists to suppress.
        const near = arrivalFieldAlphas(arrivalProgress(14), true);
        const centre = arrivalFieldAlphas(arrivalProgress(0), true);

        expect(near).toEqual(centre);
        expect(near.lean).toBe(0);
        expect(near.edge).toBeLessThan(arrivalField.edge.peak);
    });
});

describe("the lean", () => {
    it("holds a bearing while the screen turns under it", () => {
        // The map is rotated so the walker's heading points up, so a lean
        // toward "where you are facing" would be the top of the screen at
        // every bearing and would say nothing. This one stays put in the
        // world instead — which is also what the recording does when the
        // walker turns their head.
        const north = leanPosition(0);
        const east = leanPosition(Math.PI / 2);
        const south = leanPosition(Math.PI);

        expect(north.y).toBeLessThan(50);
        expect(north.x).toBeCloseTo(50, 5);
        expect(east.x).toBeLessThan(50);
        expect(south.y).toBeGreaterThan(50);
    });

    it("stays on the screen at every bearing", () => {
        for (let degrees = 0; degrees < 360; degrees += 15) {
            const { x, y } = leanPosition((degrees * Math.PI) / 180);
            expect(x).toBeGreaterThan(0);
            expect(x).toBeLessThan(100);
            expect(y).toBeGreaterThan(0);
            expect(y).toBeLessThan(100);
        }
    });
});
