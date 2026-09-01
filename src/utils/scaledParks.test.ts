import { describe, expect, it } from "vitest";
import { getVariantCenter } from "./scaledParks";
import { distanceInMeters } from "./geo";

/**
 * The map's opening view. It used to be [0, 0] zoom 20 — the Gulf of Guinea —
 * so a walker whose GPS took a few seconds watched a screenful of ocean tiles
 * load and then be thrown away. Measured: 40 tile requests before the first
 * fix, all of them useless.
 */
describe("getVariantCenter", () => {
    it("opens on the DSU campus walk by default", () => {
        const center = getVariantCenter();

        // The reference point the scaled parks are laid out around.
        expect(distanceInMeters(center, [-97.110789, 44.012222])).toBeLessThan(1);
    });

    it("opens on Terrace Park for the terrace variant", () => {
        const center = getVariantCenter("terrace");

        // Middle of the Sioux Falls bounds, ~370 km from the DSU campus.
        expect(center[0]).toBeGreaterThan(-96.75);
        expect(center[0]).toBeLessThan(-96.74);
        expect(center[1]).toBeGreaterThan(43.55);
        expect(center[1]).toBeLessThan(43.56);
    });

    it("never opens on Null Island", () => {
        for (const variant of ["dsu", "terrace"] as const) {
            expect(distanceInMeters(getVariantCenter(variant), [0, 0])).toBeGreaterThan(1_000_000);
        }
    });
});
