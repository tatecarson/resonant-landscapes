import { describe, expect, it } from "vitest";
import { getScaledPoints, getVariantCenter } from "./scaledParks";
import { distanceInMeters, type Coordinate } from "./geo";
import { point } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import chathamNoGoPolygons from "../data/chathamNoGoPolygons.json";
import type { Feature, Polygon } from "geojson";

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

    it("opens on the Chatham campus for the chatham variant", () => {
        const center = getVariantCenter("chatham");

        // Middle of OSM way 172206707, the campus polygon, in Pittsburgh.
        expect(center[0]).toBeGreaterThan(-79.93);
        expect(center[0]).toBeLessThan(-79.92);
        expect(center[1]).toBeGreaterThan(40.44);
        expect(center[1]).toBeLessThan(40.46);
    });

    it("never opens on Null Island", () => {
        for (const variant of ["dsu", "terrace", "chatham"] as const) {
            expect(distanceInMeters(getVariantCenter(variant), [0, 0])).toBeGreaterThan(1_000_000);
        }
    });
});

/**
 * Chatham opens to an audience on 5 October 2026, which is the difference
 * between this and the other two sites: strangers will walk it, and a point
 * in a road is a point someone stands in a road to hear.
 *
 * What this cannot check is the pond. The Anne Putnam Mallinson pond is
 * absent from OpenStreetMap, so it is in no polygon set and no assertion
 * here can see it. That one is on rl-wc3.3, on foot.
 */
describe("the Chatham placement", () => {
    const points = getScaledPoints("chatham");

    it("puts all 13 parks on the campus", () => {
        expect(points).toHaveLength(13);
        for (const park of points) {
            const [lon, lat] = park.scaledCoords as Coordinate;
            expect(lon, `${park.name} is off the campus to the east or west`).toBeGreaterThan(-79.928);
            expect(lon, `${park.name} is off the campus to the east or west`).toBeLessThan(-79.922);
            expect(lat, `${park.name} is off the campus to the north or south`).toBeGreaterThan(40.444);
            expect(lat, `${park.name} is off the campus to the north or south`).toBeLessThan(40.4511);
        }
    });

    it("puts no park in a building, a car park or a road", () => {
        // The snap only ever moves a pin somewhere that is not in this set,
        // which is why the roads have to be in it: without them it would
        // happily push a point off a building and into Woodland Road.
        for (const park of points) {
            const candidate = point(park.scaledCoords as Coordinate);
            const hit = (chathamNoGoPolygons.features as unknown[]).find((feature) => {
                try {
                    return booleanPointInPolygon(candidate, feature as Feature<Polygon>);
                } catch {
                    return false;
                }
            }) as { properties?: { kind?: string; name?: string } } | undefined;

            expect(
                hit,
                `${park.name} landed in a ${hit?.properties?.kind} (${hit?.properties?.name ?? "unnamed"})`
            ).toBeUndefined();
        }
    });

    it("does not bunch the listening areas tighter than they already are", () => {
        /*
         * A floor at the measured value, not an aspiration.
         *
         * DSU's tightest pair is 16 m and that walk has been walked for
         * months, so touching listening areas are already how the piece
         * behaves. Chatham cannot reach 16 m by this method: sweeping the
         * buffer gives 5.8, 10.0, 7.6 and 9.1 m, and 10 m is the best of
         * them. Whether 13 points belong on this campus at all is an open
         * question on rl-wc3.1, to be answered by looking at the site rather
         * than by tuning a constant.
         *
         * So this pins what is actually true today and fails if a change
         * makes it worse, which is all a test can honestly do here.
         */
        let closest = Infinity;
        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
                closest = Math.min(
                    closest,
                    distanceInMeters(
                        points[i].scaledCoords as Coordinate,
                        points[j].scaledCoords as Coordinate
                    )
                );
            }
        }
        expect(closest).toBeGreaterThan(9.5);
    });
});
