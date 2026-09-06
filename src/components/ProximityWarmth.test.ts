import { describe, expect, it } from "vitest";

import { warmthFor } from "./ProximityWarmth";
import type { Coordinate } from "../utils/geo";

/**
 * The tint replaced a chip that said the name, the distance and the compass
 * point (rl-2l3). What is asserted here is not the ramp — that is tuning, and
 * a test that pins it would break every time it is tuned — but the three
 * decisions the ramp was built around, each of which is a way to get this
 * wrong that would look fine on a desk.
 */

const WALKER: Coordinate = [-97.110789, 44.012222];
/** Degrees of latitude in a metre, near enough at this latitude. */
const METRE = 1 / 111_320;

/** A park exactly `metres` due north of the walker. */
const parkAt = (name: string, metres: number) => ({
    name,
    scaledCoords: [WALKER[0], WALKER[1] + metres * METRE] as Coordinate,
});

describe("warmthFor", () => {
    it("runs warm at arrival and cold across the campus", () => {
        const near = warmthFor(WALKER, [parkAt("near", 15)], new Set());
        const far = warmthFor(WALKER, [parkAt("far", 120)], new Set());
        const further = warmthFor(WALKER, [parkAt("further", 260)], new Set());

        expect(near).toBeCloseTo(1, 1);
        expect(far).toBeCloseTo(0, 1);
        // Beyond the ramp there is nothing colder than cold. A walk 290 m
        // wide would otherwise report negative warmth and mix a colour out
        // of range.
        expect(further).toBe(0);
    });

    it("warms as the walker closes", () => {
        const at100 = warmthFor(WALKER, [parkAt("p", 100)], new Set());
        const at60 = warmthFor(WALKER, [parkAt("p", 60)], new Set());
        const at25 = warmthFor(WALKER, [parkAt("p", 25)], new Set());

        expect(at60).toBeGreaterThan(at100);
        expect(at25).toBeGreaterThan(at60);
    });

    /**
     * The one that matters. The spots sit a median 20 m apart, so a tint keyed
     * to the nearest recording of ANY kind would sit warm everywhere inside
     * the cluster and say nothing — and it would be at its warmest while the
     * walker stood in one they had already heard, pointing at nothing.
     */
    it("ignores a park the walker has already heard, however close", () => {
        const parks = [parkAt("heard", 5), parkAt("unheard", 110)];

        const cold = warmthFor(WALKER, parks, new Set(["heard"]));
        const warm = warmthFor(WALKER, parks, new Set());

        expect(warm).toBeCloseTo(1, 1);
        expect(cold).toBeLessThan(0.2);
    });

    it("cools where the walker stands once that park has been heard", () => {
        const parks = [parkAt("here", 12), parkAt("elsewhere", 200)];

        const before = warmthFor(WALKER, parks, new Set());
        const after = warmthFor(WALKER, parks, new Set(["here"]));

        expect(before).toBeCloseTo(1, 1);
        expect(after).toBe(0);
    });

    it("goes cold when every recording has been heard", () => {
        const parks = [parkAt("a", 10), parkAt("b", 30)];

        expect(warmthFor(WALKER, parks, new Set(["a", "b"]))).toBe(0);
    });

    it("stays cold before the first fix arrives", () => {
        expect(warmthFor(null, [parkAt("a", 10)], new Set())).toBe(0);
    });
});

/**
 * The curve, asserted as the property it exists for rather than as numbers.
 *
 * A linear ramp put the two nearest unheard spots on this campus three
 * hundredths of alpha apart, which is a tint that never visibly moves while
 * the walker works through the cluster. What matters is that consuming a spot
 * makes a difference the eye can find.
 */
describe("the falloff curve", () => {
    it("separates two spots that are close together", () => {
        const parks = [parkAt("first", 25), parkAt("second", 43)];

        const before = warmthFor(WALKER, parks, new Set());
        const after = warmthFor(WALKER, parks, new Set(["first"]));

        // The real pair from the DSU placement, standing off Hartford Beach.
        expect(before - after).toBeGreaterThan(0.2);
    });

    it("spends its range on the near ground rather than the far", () => {
        const near = warmthFor(WALKER, [parkAt("p", 30)], new Set());
        const mid = warmthFor(WALKER, [parkAt("p", 60)], new Set());
        const far = warmthFor(WALKER, [parkAt("p", 90)], new Set());

        // Equal steps in metres, unequal steps in warmth: the last thirty
        // metres are worth more than the thirty before them.
        expect(near - mid).toBeGreaterThan(mid - far);
    });
});
