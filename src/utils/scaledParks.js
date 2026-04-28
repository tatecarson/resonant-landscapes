import * as turf from '@turf/turf';

import stateParks from '../data/stateParks.json';
import noGoPolygons from '../data/terraceNoGoPolygons.json';
import { scaleCoordinates } from './geo';

// lon, lat

// ---- DSU campus variant -------------------------------------------------
// Translate-scale-translate the real SD park coordinates around DSU campus
// center. Works because the campus is open green space — no water, buildings,
// or major roads inside the walkable area to dodge.
const DSU_REFERENCE_POINT = [-97.110789, 44.012222];
const DSU_SCALE_LONG = 0.00045;
const DSU_SCALE_LAT = 0.00066;

function dsuScaledPoints() {
    return stateParks.map(park => ({
        ...park,
        scaledCoords: scaleCoordinates(park.cords, DSU_REFERENCE_POINT, DSU_SCALE_LONG, DSU_SCALE_LAT),
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
function rotateSD([lon, lat]) {
    return ROTATE_DIRECTION === 'cw' ? [lat, -lon] : [-lat, lon];
}

function findBoundingBoxXY(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
}

function isPointInNoGo(point) {
    return noGoPolygons.features.some(f => {
        try {
            return turf.booleanPointInPolygon(point, f);
        } catch {
            return false;
        }
    });
}

// Spiral the point outward in a square pattern until it clears every no-go
// polygon. Cap iterations so a buggy polygon never freezes the page.
function snapOutOfNoGo(point) {
    const stepDeg = 0.00008; // ~ 9 m east, ~ 9 m north (good lab/walking resolution)
    const maxIterations = 240;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, N, W, S

    let current = point;
    let leg = 1;
    let dirIndex = 0;
    let stepsThisLeg = 0;
    let iter = 0;

    while (isPointInNoGo(current) && iter < maxIterations) {
        const [dx, dy] = dirs[dirIndex];
        const [lon, lat] = current.geometry.coordinates;
        current = turf.point([lon + dx * stepDeg, lat + dy * stepDeg]);
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
        // eslint-disable-next-line no-console
        console.warn('[scaledParks] snapOutOfNoGo hit iteration cap; returning last position', current.geometry.coordinates);
    }
    return current;
}

function terraceScaledPoints() {
    const { west, east, north, south } = TERRACE_BOUNDS;
    const W = west + TERRACE_BUFFER;
    const E = east - TERRACE_BUFFER;
    const N = north - TERRACE_BUFFER;
    const S = south + TERRACE_BUFFER;

    const rotated = stateParks.map(p => rotateSD(p.cords));
    const { minX, maxX, minY, maxY } = findBoundingBoxXY(rotated);
    const xScale = (E - W) / (maxX - minX);
    const yScale = (N - S) / (maxY - minY);

    return stateParks.map((park, i) => {
        const [rx, ry] = rotated[i];
        const scaledLon = W + (rx - minX) * xScale;
        const scaledLat = S + (ry - minY) * yScale;
        let pt = turf.point([scaledLon, scaledLat]);
        if (isPointInNoGo(pt)) pt = snapOutOfNoGo(pt);
        return { ...park, scaledCoords: pt.geometry.coordinates };
    });
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
export function getScaledPoints(variant = 'dsu') {
    return variant === 'terrace' ? terraceScaledPoints() : dsuScaledPoints();
}

const scaledPoints = getScaledPoints('dsu');

export { currentLocationTestPark, testPark, testParks, scaledPoints };

export default scaledPoints;
