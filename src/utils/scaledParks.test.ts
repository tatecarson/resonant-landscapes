import { describe, expect, it } from "vitest";
import { getScaledPoints, getVariantCenter } from "./scaledParks";
import { distanceInMeters, type Coordinate } from "./geo";
import { point } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import chathamNoGoPolygons from "../data/chathamNoGoPolygons.json";
import terraceNoGoPolygons from "../data/terraceNoGoPolygons.json";
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

    /*
     * There is deliberately no assertion here about how far apart the Chatham
     * points are, or how much room each has.
     *
     * Both are bad and both are unresolved. Every one of the 13 sits in a
     * pocket of legal ground smaller than its own 15 m listening radius, and
     * the closest pair is a few metres. That is not a number to pin: it is
     * the open question on rl-wc3.1, which is whether a bounding-box remap
     * suits this campus at all, and it will not be settled by a test.
     *
     * Pinning today's value would make a bad layout look like a decision.
     * What is asserted above is what must be true whatever gets decided: the
     * points are on the campus and not inside a building, a car park or a
     * road.
     */
});

/**
 * Room to stand, on the sites that have obstacle data.
 *
 * The snap used to stop at the first position that was not inside a no-go
 * polygon, and the first position outside an obstacle is against its edge.
 * Two of Terrace's points had no room at all: one metre in some direction was
 * a building or N Grange Ave. See rl-wc3.4.
 *
 * Chatham is excluded on purpose. Its legal ground is fragmented into pockets
 * smaller than the target, so it cannot meet this yet, and the reason is the
 * placement question on rl-wc3.1 rather than the snap.
 */
describe("room around each point", () => {
    const clearanceOf = (
        coords: Coordinate,
        polygons: { features: unknown[] },
        want = 8
    ) => {
        const [lon, lat] = coords;
        const lonPerMetre = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
        const latPerMetre = 1 / 111_320;
        const clear = (candidate: Coordinate) =>
            !polygons.features.some((feature) => {
                try {
                    return booleanPointInPolygon(point(candidate), feature as Feature<Polygon>);
                } catch {
                    return false;
                }
            });

        let room = 0;
        for (let radius = 2; radius <= want; radius += 2) {
            let ringClear = true;
            for (let i = 0; i < 16; i += 1) {
                const angle = (i / 16) * 2 * Math.PI;
                if (
                    !clear([
                        lon + Math.cos(angle) * radius * lonPerMetre,
                        lat + Math.sin(angle) * radius * latPerMetre,
                    ])
                ) {
                    ringClear = false;
                    break;
                }
            }
            if (!ringClear) break;
            room = radius;
        }
        return room;
    };

    it("gives every Terrace point somewhere to stand", () => {
        for (const park of getScaledPoints("terrace")) {
            expect(
                clearanceOf(park.scaledCoords as Coordinate, terraceNoGoPolygons),
                `${park.name} is wedged against something`
            ).toBeGreaterThanOrEqual(8);
        }
    });
});
