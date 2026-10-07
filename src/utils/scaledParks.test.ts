import { describe, expect, it } from "vitest";
import {
    CHATHAM_SOUTH_LIMIT,
    chathamFieldPins,
    getScaledPoints,
    getVariantCenter,
} from "./scaledParks";
import { distanceInMeters, type Coordinate } from "./geo";
import { point } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import chathamNoGoPolygons from "../data/chathamNoGoPolygons.json";
import chathamSurveyedNoGo from "../data/chathamSurveyedNoGo.json";
import chathamCampus from "../data/chathamCampus.json";
import terraceNoGoPolygons from "../data/terraceNoGoPolygons.json";
import type { Feature, Polygon } from "geojson";

/** What placement avoids at Chatham: the OSM import plus what was found on foot. */
const chathamNoGo = {
    features: [...chathamNoGoPolygons.features, ...chathamSurveyedNoGo.features],
};

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

    /*
     * The campus polygon, not its bounding box.
     *
     * This used to compare four lon/lat numbers, and that is the check PR
     * #91's first draft passed with eleven of the thirteen points standing in
     * Shadyside gardens: inside the rectangle, not in any building, road or
     * car park, and not on the campus either. A campus is not a rectangle.
     * The placement constrains points to the polygon, so the test has to ask
     * the same question the code does.
     */
    it("puts all 13 parks on the campus", () => {
        expect(points).toHaveLength(13);
        for (const park of points) {
            // Hand pins were chosen standing on the ground, which knows the
            // campus better than the OSM outline does. Sica Hollow's sits
            // about 13 m past it (rl-1e7).
            if (park.name in chathamFieldPins) continue;
            expect(
                booleanPointInPolygon(
                    point(park.scaledCoords as Coordinate),
                    chathamCampus as Feature<Polygon>
                ),
                `${park.name} is off the campus`
            ).toBe(true);
        }
    });

    it("puts no park in a building, a car park, a road or a locked field", () => {
        // The snap only ever moves a pin somewhere that is not in this set,
        // which is why the roads have to be in it: without them it would
        // happily push a point off a building and into Woodland Road.
        //
        // One exception, chosen on foot. Roads are buffered 12 m either side
        // of the centreline for trunk roads, which is wider than Fifth
        // Avenue's carriageway, and Custer's pin is on the pavement 8 m from
        // the centreline: inside the buffer, out of the traffic (rl-9cp).
        const inRoadBufferOnPurpose: Record<string, string> = {
            "Custer State Park": "Fifth Avenue",
        };
        for (const park of points) {
            const candidate = point(park.scaledCoords as Coordinate);
            const allowedRoad = inRoadBufferOnPurpose[park.name];
            const hit = (chathamNoGo.features as unknown[]).find((feature) => {
                const props = (feature as { properties?: { kind?: string; name?: string } }).properties;
                if (allowedRoad && props?.kind === "road" && props.name === allowedRoad) return false;
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
     * Spacing is asserted now, and it was not before.
     *
     * The old layout put the closest pair 3.2 m apart, which is two parks
     * sharing one listening area, and there was no honest number to pin. The
     * cause turned out not to be the campus: clearance asked how much room a
     * point had against buildings and roads, and nothing asked whether it had
     * room against the other twelve. Placing each point against the ones
     * already down took the closest pair to 23.8 m without moving Terrace or
     * DSU by a metre. See rl-wc3.5.
     *
     * Fifteen metres is the floor because it is the enter radius: closer than
     * that and a walker is inside two parks at once.
     */
    it("keeps every pair of parks out of each other's listening area", () => {
        const points = getScaledPoints("chatham");
        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
                const [lonA, latA] = points[i].scaledCoords as Coordinate;
                const [lonB, latB] = points[j].scaledCoords as Coordinate;
                const midLat = ((latA + latB) / 2) * (Math.PI / 180);
                const metres = Math.hypot(
                    (lonA - lonB) * 111_320 * Math.cos(midLat),
                    (latA - latB) * 111_320
                );
                expect(
                    metres,
                    `${points[i].name} and ${points[j].name} would be heard as one place`
                ).toBeGreaterThanOrEqual(15);
            }
        }
    });
});

/**
 * Room to stand, on the sites that have obstacle data.
 *
 * The snap used to stop at the first position that was not inside a no-go
 * polygon, and the first position outside an obstacle is against its edge.
 * Two of Terrace's points had no room at all: one metre in some direction was
 * a building or N Grange Ave. See rl-1u7.17.
 *
 * Chatham is held to the same bar. It could not meet it while the thirteen
 * points were fighting each other for the same pockets; with the separation
 * constraint in place its worst point has 8 m and its median 9 m.
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

    // Not the hand-placed ones. Clearance stands in for a look at the ground,
    // and those were chosen by someone who had looked.
    it("gives every computed Chatham point somewhere to stand", () => {
        for (const park of getScaledPoints("chatham")) {
            if (park.name in chathamFieldPins) continue;
            expect(
                clearanceOf(park.scaledCoords as Coordinate, chathamNoGo),
                `${park.name} is wedged against something`
            ).toBeGreaterThanOrEqual(8);
        }
    });
});

/**
 * What the 2026-09-30 field walk found, held in place.
 *
 * Mike walked all thirteen Chatham points with the app running. Nine were
 * fine outright. Union Grove, behind Dilworth Hall, is reachable but muddy.
 * Palisades and Lake Herman can be reached at the edge but not the centre,
 * and sound starts at the edge. Oakwood Lakes sat inside the soccer field's
 * fence, which is padlocked, and has moved (rl-wc3.3.1).
 *
 * Those four have since been placed by hand from his second walk (rl-iys)
 * and are held by the next block. So have two of the nine: Sica Hollow,
 * which stood in a driveway (rl-1e7), and Custer, on the steps up to an
 * apartment building (rl-9cp). The other seven are what is left here.
 *
 * Placement is computed, so any change to the no-go data or the placement
 * code can move a point, and nothing in the other tests would object: a
 * moved point is still on campus, still clear of buildings, still spaced.
 * What it no longer is, is walked. These are the positions that were stood
 * at. If one of them moves, walk it again and update it here.
 */
describe("the Chatham points the field walk checked", () => {
    const WALKED_2026_09_30: Record<string, Coordinate> = {
        "Roy Lake State Park": [-79.923127, 40.446821],
        "Fort Sisseton Historic State Park": [-79.92324, 40.447017],
        "Hartford Beach State Park": [-79.924308, 40.446069],
        "Fisher Grove State Park": [-79.924539, 40.446377],
        "Good Earth State Park": [-79.924723, 40.447373],
        "Newton Hills State Park": [-79.924624, 40.44761],
        "Bear Butte State Park": [-79.924915, 40.45005],
    };
    const points = getScaledPoints("chatham");

    it("leaves every walked point where it was walked", () => {
        for (const [name, walked] of Object.entries(WALKED_2026_09_30)) {
            const park = points.find((p) => p.name === name);
            expect(park, `${name} is missing`).toBeDefined();
            expect(
                distanceInMeters(park!.scaledCoords as Coordinate, walked),
                `${name} has moved off the spot that was walked`
            ).toBeLessThan(1);
        }
    });

    it("keeps Oakwood Lakes out of the locked soccer field", () => {
        const oakwood = points.find((p) => p.name === "Oakwood Lakes State Park")!;
        const enclosure = chathamSurveyedNoGo.features.find(
            (f) => f.properties.kind === "fenced"
        ) as Feature<Polygon>;
        expect(booleanPointInPolygon(point(oakwood.scaledCoords as Coordinate), enclosure)).toBe(false);
        // Where it stood on the walk, three metres off the pitch and inside
        // the fence. The new spot has to be somewhere else, not a nudge.
        expect(
            distanceInMeters(oakwood.scaledCoords as Coordinate, [-79.924725, 40.444714])
        ).toBeGreaterThan(15);
    });
});

/**
 * What Mike's 2026-10-03 walk changed (rl-iys).
 *
 * He went back to the four the first walk flagged and said where each should
 * go, and drew a southern boundary: nothing past the south end of the Art &
 * Design Center, because beyond it are a campus house's backyard and private
 * homes. Oakwood Lakes was there.
 */
describe("the Chatham points placed by hand", () => {
    const points = getScaledPoints("chatham");

    it("puts each hand-placed park on its pin", () => {
        expect(Object.keys(chathamFieldPins)).toHaveLength(6);
        for (const [name, pin] of Object.entries(chathamFieldPins)) {
            const park = points.find((p) => p.name === name);
            expect(park, `${name} is not a park`).toBeDefined();
            expect(park!.scaledCoords).toEqual(pin);
        }
    });

    it("moves each of them somewhere new, not a nudge", () => {
        const before: Record<string, Coordinate> = {
            "Lake Herman State Park": [-79.924779, 40.446731],
            "Palisades State Park": [-79.925066, 40.447182],
            "Union Grove State Park": [-79.925237, 40.447418],
            "Oakwood Lakes State Park": [-79.924965, 40.445194],
            // In a driveway on Murray Hill Place (rl-1e7).
            "Sica Hollow State Park": [-79.923763, 40.446603],
            // On the steps up to an apartment building (rl-9cp).
            "Custer State Park": [-79.925953, 40.450879],
        };
        for (const [name, was] of Object.entries(before)) {
            const park = points.find((p) => p.name === name)!;
            expect(
                distanceInMeters(park.scaledCoords as Coordinate, was),
                `${name} has barely moved`
            ).toBeGreaterThan(10);
        }
    });

    it("keeps every point at or north of the Art & Design Center's south end", () => {
        for (const park of points) {
            const [, lat] = park.scaledCoords as Coordinate;
            expect(lat, `${park.name} is south of the Art & Design Center`).toBeGreaterThanOrEqual(
                CHATHAM_SOUTH_LIMIT
            );
        }
    });
});
