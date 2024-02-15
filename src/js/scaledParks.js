import * as turf from "@turf/turf";

// lon, lat 
const stateParks = [
    { name: "Sica Hollow State Park", cords: [-97.24267, 45.7421] },
    { name: "Roy Lake State Park", cords: [-97.44881, 45.70969] },
    { name: "Fort Sisseton Historic State Park", cords: [-97.52827, 45.6594] },
    { name: "Hartford Beach State Park", cords: [-96.67307, 45.40219] },
    { name: "Fisher Grove State Park", cords: [-98.35471, 44.88346] },
    { name: "Oakwood Lakes State Park", cords: [-96.98198, 44.44975] },
    { name: "Lake Herman State Park", cords: [-97.16042, 43.99288] },
    { name: "Palisades State Park", cords: [-96.51717, 43.68764] },
    { name: "Good Earth State Park", cords: [-96.61351, 43.47997] },
    { name: "Newton Hills State Park", cords: [-96.57019, 43.21904] },
    { name: "Union Grove State Park", cords: [-96.78532, 42.92024] },
    { name: "Custer State Park", cords: [-103.689, 43.61433] },
    { name: "Bear Butte State Park", cords: [-103.4509, 44.45989] },
];

// Placeholder for your scale factors
const scaleLat = 0.00065;
const scaleLong = 0.0004;

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