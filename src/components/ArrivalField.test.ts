import { describe, expect, it } from "vitest";

import { arrivalFieldAlphas, hueFor } from "./ArrivalField";
import { arrivalProgress, basemapOpacity } from "../utils/arrival";
import { arrivalField, hslChannels, palette } from "../theme/palette";
import {
    CENTER_ROTATION_RADIUS_METERS,
    ENTER_DISTANCE_METERS,
    EXIT_DISTANCE_METERS,
} from "../config/geofence";

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
        expect(near.edge).toBeLessThan(arrivalField.edge.peak);
    });
});

describe("the basemap", () => {
    it("goes as the field comes", () => {
        // The two are one motion. Every metre that adds field takes map, which
        // is the difference between a tint over a map and the map being
        // replaced by what the walker came for.
        let previous = 2;
        for (const metres of WALK_IN) {
            const opacity = basemapOpacity(metres);
            expect(opacity, `the map came back at ${metres} m`).toBeLessThanOrEqual(previous);
            previous = opacity;
        }
    });

    it("is whole at the threshold and gone at the centre", () => {
        expect(basemapOpacity(ENTER_DISTANCE_METERS)).toBe(1);
        expect(basemapOpacity(CENTER_ROTATION_RADIUS_METERS)).toBe(0);
        expect(basemapOpacity(0)).toBe(0);
    });

    it("clears exactly as turning starts to mean something", () => {
        // Not a second threshold dropped into the dissolve: three metres is
        // where the walk already counts the walker as standing at the centre,
        // so the tiles finish clearing as rotation takes the screen and the
        // sweep runs on colour rather than over a ghost of a street plan.
        expect(basemapOpacity(CENTER_ROTATION_RADIUS_METERS + 0.5)).toBeGreaterThan(0);
        expect(basemapOpacity(CENTER_ROTATION_RADIUS_METERS - 0.5)).toBe(0);
    });

    it("leaves the map alone outside the spot", () => {
        expect(basemapOpacity(EXIT_DISTANCE_METERS)).toBe(1);
        expect(basemapOpacity(Number.NaN)).toBe(1);
    });
});

describe("the sweep", () => {
    it("is the palette itself at north", () => {
        // The old mapping was 220 - heading, which is blue at north for no
        // nameable reason, and is why nothing in the app could be matched to
        // this surface. Anchored to `panel`, the walker who arrives facing
        // north is standing in exactly the mint the strip is made of.
        expect(hueFor(0)).toBeCloseTo(hslChannels(palette.panel).hue, 5);
    });

    it("tells every heading apart", () => {
        // The whole wheel, deliberately. Narrowing it to the greens was tried
        // in the palette pass and rejected: half the bearings become
        // indistinguishable and the sweep stops saying anything about turning.
        const hues = new Set<number>();
        for (let degrees = 0; degrees < 360; degrees += 15) {
            hues.add(Math.round(hueFor((degrees * Math.PI) / 180)));
        }

        expect(hues.size).toBe(24);
        expect(Math.max(...hues) - Math.min(...hues)).toBeGreaterThan(300);
    });

    it("turns the opposite way to the walker", () => {
        // The map is rotated so the heading points up the screen. The wheel
        // running the other way is what makes the colour feel attached to the
        // world rather than to the phone.
        expect(hueFor(Math.PI / 2)).toBeCloseTo(hueFor(0) - 90, 5);
        expect(hueFor(-Math.PI / 2)).toBeCloseTo(hueFor(0) + 90, 5);
    });

    it("stays a usable hue after several turns", () => {
        // mapHeading accumulates rather than wrapping — it is built by adding
        // the shortest delta to the last one, so a walker who keeps turning
        // the same way passes several full turns, and a negative hue would
        // silently stop being a colour at all.
        for (let turns = -3; turns <= 3; turns += 0.125) {
            const hue = hueFor(turns * 2 * Math.PI + 0.3);
            expect(hue).toBeGreaterThanOrEqual(0);
            expect(hue).toBeLessThan(360);
        }
    });
});
