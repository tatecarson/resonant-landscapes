import stateParks from '../data/stateParks.json'
import { scaleCoordinates } from './geo';

// lon, lat 
console.log(stateParks)

// Placeholder for your scale factors
// const scaleLat = 0.00065;
// const scaleLong = 0.0004;
const scaleLat = 0.00066;
const scaleLong = 0.00045;

// Assuming a reference point (for example, the center of DSU campus)
const referencePoint = [-97.110789, 44.012222];
const testPark = {
    name: "Custer Test",
    cords: [-97.112994, 44.012224],
    recordingsCount: 1,
    sectionsCount: 1,
    scaledCoords: [-97.112994, 44.012224]
};

// Translate points to origin, apply scale, and translate back
const scaledPoints = stateParks.map(park => {
    return {
        ...park,
        scaledCoords: scaleCoordinates(park.cords, referencePoint, scaleLong, scaleLat)
    };
});

export { testPark, scaledPoints };

export default scaledPoints;
