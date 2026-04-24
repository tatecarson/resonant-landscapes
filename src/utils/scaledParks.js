import stateParks from '../data/stateParks.json'
import { scaleCoordinates } from './geo';

// lon, lat

// Per-variant reference point + scale factors. Same factors across variants
// for now; tune onsite after a Terrace Park walkthrough.
export const VARIANTS = {
    dsu:     { referencePoint: [-97.110789, 44.012222],             scaleLong: 0.00045, scaleLat: 0.00066 },
    terrace: { referencePoint: [-96.74190700446347, 43.55479966608823], scaleLong: 0.00045, scaleLat: 0.00066 },
};

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

export function getScaledPoints(variant = 'dsu') {
    const { referencePoint, scaleLong, scaleLat } = VARIANTS[variant] ?? VARIANTS.dsu;
    return stateParks.map(park => ({
        ...park,
        scaledCoords: scaleCoordinates(park.cords, referencePoint, scaleLong, scaleLat),
    }));
}

const scaledPoints = getScaledPoints('dsu');

export { currentLocationTestPark, testPark, testParks, scaledPoints };

export default scaledPoints;
