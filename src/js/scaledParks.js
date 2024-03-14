import * as turf from "@turf/turf";
import stateParks from '../data/stateParks.json'

// lon, lat 
console.log(stateParks)

// Placeholder for your scale factors
// const scaleLat = 0.00065;
// const scaleLong = 0.0004;
const scaleLat = 0.00066;
const scaleLong = 0.00045;

// Assuming a reference point (for example, the center of DSU campus)
const referencePoint = turf.point([-97.110789, 44.012222]);

// Translate points to origin, apply scale, and translate back
const scaledPoints = stateParks.map(park => {
    // Original park point
    const originalPoint = turf.point(park.cords);

    // Calculate the difference from the reference point
    const diffLat = originalPoint.geometry.coordinates[1] - referencePoint.geometry.coordinates[1];
    const diffLong = originalPoint.geometry.coordinates[0] - referencePoint.geometry.coordinates[0];

    // Apply scale factors
    const scaledLat = diffLat * scaleLat;
    const scaledLong = diffLong * scaleLong;

    // Translate points back
    const scaledPoint = turf.point([
        referencePoint.geometry.coordinates[0] + scaledLong,
        referencePoint.geometry.coordinates[1] + scaledLat
    ]);

    return {
        ...park,
        scaledCoords: scaledPoint.geometry.coordinates
    };
});

export default scaledPoints;