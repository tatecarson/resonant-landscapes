import { point } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

import stateParks from '../data/stateParks.json';
import terraceNoGoPolygons from '../data/terraceNoGoPolygons.json';
import chathamNoGoPolygons from '../data/chathamNoGoPolygons.json';
import chathamCampus from '../data/chathamCampus.json';
import { scaleCoordinates, type Coordinate } from './geo';
import type { Feature, MultiPolygon, Point, Polygon } from 'geojson';

// lon, lat

// ---- DSU campus variant -------------------------------------------------
// Translate-scale-translate the real SD park coordinates around DSU campus
// center. Works because the campus is open green space — no water, buildings,
// or major roads inside the walkable area to dodge.
const DSU_REFERENCE_POINT: Coordinate = [-97.110789, 44.012222];
const DSU_SCALE_LONG = 0.00045;
const DSU_SCALE_LAT = 0.00066;

function dsuScaledPoints() {
    return stateParks.map(park => ({
        ...park,
        scaledCoords: scaleCoordinates(park.cords as Coordinate, DSU_REFERENCE_POINT, DSU_SCALE_LONG, DSU_SCALE_LAT),
    }));
}

// ---- Terrace Park (Sioux Falls) variant ---------------------------------
// Modeled after resonant-landscapes-milan: linearly remap the SD parks'
// bounding box into a target rectangle, then snap any pin that lands inside
// a no-go polygon (Covell Lake, buildings, N Grange Ave) outwards until it
// clears the obstacle.
//
// Twist for Terrace Park: we rotate the SD shape 90° before remapping. The SD
// state parks span ~7° E-W and ~3° N-S, while Terrace Park's walkable corridor
// is the opposite — narrow E-W and tall N-S. Rotating SD's long axis to align
// with Terrace's long axis preserves the parks' relative spatial relationships
// instead of squashing them.
const TERRACE_BOUNDS = {
    west:  -96.7460,  // ~N Lake Ave (west edge of park, west of Covell Lake)
    east:  -96.7418,  // ~just west of N Grange Ave (east edge of park)
    north:  43.5585,  // ~just south of W Madison St (north edge)
    south:  43.5540,  // ~just north of W 4th St (keeps south cluster on park green)
};
const TERRACE_BUFFER = 0.00010;
const ROTATE_DIRECTION = 'cw'; // 'cw' or 'ccw' — flip if the N/S orientation feels wrong onsite

// CW: (lon, lat) -> (lat, -lon).  CCW: (lon, lat) -> (-lat, lon).
// Output is an abstract (x, y) used for bbox remap; not a real-world coord.
/** Abstract (x, y) for the bbox remap — not a real-world coordinate. */
type PlanePoint = [number, number];

function rotateSD([lon, lat]: Coordinate): PlanePoint {
    return ROTATE_DIRECTION === 'cw' ? [lat, -lon] : [-lat, lon];
}

function findBoundingBoxXY(points: PlanePoint[]) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
}

type NoGoSet = { features: unknown[] };

function isPointInNoGo(candidate: Feature<Point>, noGo: NoGoSet) {
    return noGo.features.some(f => {
        try {
            return booleanPointInPolygon(candidate, f as Feature<Polygon | MultiPolygon>);
        } catch {
            return false;
        }
    });
}

// Spiral the point outward in a square pattern until it clears every no-go
// polygon. Cap iterations so a buggy polygon never freezes the page.
/**
 * Where a point is allowed to end up.
 *
 * Two questions, not one. Not in a building, a road or a car park, and also
 * on the site itself where a site polygon is given. The bounds are a
 * rectangle and a campus is not, so the first eleven Chatham points passed
 * every no-go test while standing in residential Shadyside.
 */
function isAcceptable(candidate: Feature<Point>, noGo: NoGoSet, inside: Feature<Polygon> | null) {
    if (isPointInNoGo(candidate, noGo)) return false;
    if (!inside) return true;
    try {
        return booleanPointInPolygon(candidate, inside);
    } catch {
        return true;
    }
}

/**
 * Walk a point that landed off-site back towards the middle of it.
 *
 * The spiral below is the wrong tool for this. It expands outward from where
 * it starts, so a point that begins outside the campus wanders further out
 * looking for somewhere legal, and two of the thirteen walked off the bottom
 * of Pittsburgh doing exactly that. Heading for the centroid always arrives,
 * because every polygon contains ground between its edge and its middle.
 *
 * Only then is the spiral useful, for the last few metres off a building.
 */
function pullOntoSite(start: Feature<Point>, inside: Feature<Polygon>): Feature<Point> {
    const current = start;
    try {
        if (booleanPointInPolygon(current, inside)) return current;
    } catch {
        return current;
    }

    const ring = inside.geometry.coordinates[0];
    let sumLon = 0;
    let sumLat = 0;
    for (const [lon, lat] of ring) {
        sumLon += lon;
        sumLat += lat;
    }
    const centroid: Coordinate = [sumLon / ring.length, sumLat / ring.length];

    // 40 steps from wherever it is to the middle: fine enough that it stops
    // just inside the edge rather than marching to the centre and bunching
    // every stray point in the same place.
    const [lon, lat] = current.geometry.coordinates as Coordinate;
    for (let step = 1; step <= 40; step += 1) {
        const t = step / 40;
        const candidate = point([lon + (centroid[0] - lon) * t, lat + (centroid[1] - lat) * t]);
        try {
            if (booleanPointInPolygon(candidate, inside)) return candidate;
        } catch {
            return current;
        }
    }
    return current;
}

function snapToAcceptable(
    start: Feature<Point>,
    noGo: NoGoSet,
    inside: Feature<Polygon> | null
): Feature<Point> {
    const stepDeg = 0.00008; // ~ 9 m east, ~ 9 m north (good lab/walking resolution)
    // Wide enough to cross a campus. The old cap of 240 was sized for nudging
    // a pin off a building; pulling one back from off-site is a longer walk.
    const maxIterations = 2000;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, N, W, S

    let current = start;
    let leg = 1;
    let dirIndex = 0;
    let stepsThisLeg = 0;
    let iter = 0;

    while (!isAcceptable(current, noGo, inside) && iter < maxIterations) {
        const [dx, dy] = dirs[dirIndex];
        const [lon, lat] = current.geometry.coordinates as Coordinate;
        current = point([lon + dx * stepDeg, lat + dy * stepDeg]);
        stepsThisLeg += 1;
        iter += 1;
        if (stepsThisLeg >= leg) {
            stepsThisLeg = 0;
            dirIndex = (dirIndex + 1) % 4;
            // Every other turn the leg length grows by one — produces an
            // expanding square spiral around the original point.
            if (dirIndex % 2 === 0) leg += 1;
        }
    }

    if (iter >= maxIterations) {
        console.warn('[scaledParks] snapToAcceptable hit iteration cap; returning last position', current.geometry.coordinates);
    }
    return current;
}

type SiteBounds = { west: number; east: number; north: number; south: number };

/**
 * Remap the South Dakota parks into a site rectangle, then move anything that
 * landed somewhere unwalkable.
 *
 * Shared by Terrace Park and Chatham because they are the same problem: a
 * site threaded with things to dodge. DSU does not use it and does not need
 * to, being open green with nothing in the way.
 *
 * The rotation is what keeps the parks' relationships intact. South Dakota
 * spans about 7 degrees east to west and 3 north to south, so its shape is
 * wide; both of these sites are tall. Turning the shape a quarter before
 * fitting it stretches it far less than squashing it would.
 */
function remapIntoSite(
    bounds: SiteBounds,
    buffer: number,
    noGo: NoGoSet,
    inside: Feature<Polygon> | null = null
) {
    const W = bounds.west + buffer;
    const E = bounds.east - buffer;
    const N = bounds.north - buffer;
    const S = bounds.south + buffer;

    const rotated = stateParks.map(p => rotateSD(p.cords as Coordinate));
    const { minX, maxX, minY, maxY } = findBoundingBoxXY(rotated);
    const xScale = (E - W) / (maxX - minX);
    const yScale = (N - S) / (maxY - minY);

    return stateParks.map((park, i) => {
        const [rx, ry] = rotated[i];
        const scaledLon = W + (rx - minX) * xScale;
        const scaledLat = S + (ry - minY) * yScale;
        let pt = point([scaledLon, scaledLat]);
        // Onto the site first, then off whatever it landed on.
        if (inside) pt = pullOntoSite(pt, inside);
        if (!isAcceptable(pt, noGo, inside)) pt = snapToAcceptable(pt, noGo, inside);
        return { ...park, scaledCoords: pt.geometry.coordinates as Coordinate };
    });
}

function terraceScaledPoints() {
    return remapIntoSite(TERRACE_BOUNDS, TERRACE_BUFFER, terraceNoGoPolygons);
}

// ---- Chatham University, Shadyside campus (Pittsburgh) ------------------
// Third site, opening 5 October 2026. Built like Terrace rather than DSU:
// this campus is threaded with roads, parking and buildings, so points are
// remapped and then snapped clear of them.
//
// Bounds are OSM way 172206707, the Chatham University campus polygon, which
// runs about 786 m north to south and 473 m east to west. Bigger than DSU's
// 293 m, so the 13 listening areas have room.
//
// One thing the polygons cannot do: the Anne Putnam Mallinson pond is absent
// from OpenStreetMap entirely, so nothing here keeps a point out of the
// water. That is on rl-wc3.3 to catch on foot.
const CHATHAM_BOUNDS: SiteBounds = {
    west: -79.9277955,
    east: -79.9222085,
    north: 40.4510886,
    south: 40.4440242,
};
// Wider than Terrace's, and chosen by measuring rather than by taste. The
// campus boundary runs along Fifth Avenue and Murray Hill Avenue, so a pin on
// the boundary is a pin on a pavement beside traffic even once the road
// polygon is cleared.
//
// Swept at 0.00025, 0.00045, 0.00065 and 0.00090: every value puts all 13
// points on campus and out of the no-go set, and the closest pair comes out
// at 5.8, 10.0, 7.6 and 9.1 m. This is the best of them, and it is still
// short of the 16 m that DSU's tightest pair sits at. See rl-wc3.1: whether
// 13 points belong on this campus at all is a question for the site, not a
// number to keep tuning.
const CHATHAM_BUFFER = 0.00045;

function chathamScaledPoints() {
    return remapIntoSite(
        CHATHAM_BOUNDS,
        CHATHAM_BUFFER,
        chathamNoGoPolygons,
        chathamCampus as Feature<Polygon>
    );
}

// ---- Test parks (debug route) ------------------------------------------
const testPark = {
    name: "Custer Test",
    cords: [-97.112994, 44.012224],
    recordingsCount: 1,
    sectionsCount: 1,
    scaledCoords: [-97.112994, 44.012224]
};

const currentLocationTestPark = {
    name: "Current Location Test",
    cords: [-96.741620, 43.552725],
    recordingsCount: 1,
    sectionsCount: 1,
    scaledCoords: [-96.741620, 43.552725]
};

const testParks = [testPark, currentLocationTestPark];

// ---- Public API ---------------------------------------------------------
/**
 * Where the walk actually is, per variant.
 *
 * The map used to open at [0, 0] zoom 20 — the Gulf of Guinea — and fetch a
 * screenful of ocean tiles before the first GPS fix replaced them. Opening on
 * the walk's own ground means those first tiles are the ones the walker is
 * about to need.
 */
export function getVariantCenter(variant: 'dsu' | 'terrace' | 'chatham' = 'dsu'): Coordinate {
    const bounds = variant === 'terrace' ? TERRACE_BOUNDS : variant === 'chatham' ? CHATHAM_BOUNDS : null;
    if (bounds) {
        return [(bounds.west + bounds.east) / 2, (bounds.north + bounds.south) / 2];
    }
    return DSU_REFERENCE_POINT;
}

export function getScaledPoints(variant = 'dsu') {
    if (variant === 'terrace') return terraceScaledPoints();
    if (variant === 'chatham') return chathamScaledPoints();
    return dsuScaledPoints();
}

export { currentLocationTestPark, testPark, testParks };
