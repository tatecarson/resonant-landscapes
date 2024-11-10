import { mod } from "./geolocation";

export function getCenterWithHeading(position: [number, number], rotation: number, resolution: number, mapSize: [number, number]): [number, number] {
    const height = mapSize[1];
    return [
        position[0] - (Math.sin(rotation) * height * resolution * 1) / 4,
        position[1] + (Math.cos(rotation) * height * resolution * 1) / 4,
    ];
}

export function addPosition(positions: any, position: [number, number], heading: number, m: number, speed: number): void {
    if (!position) return;
    const x = position[0];
    const y = position[1];
    const fCoords = positions.getCoordinates();
    const previous = fCoords[fCoords.length - 1];
    const prevHeading = previous && previous[2];
    let newHeading = heading;

    if (prevHeading !== undefined) {
        let headingDiff = newHeading - mod(prevHeading);
        if (Math.abs(headingDiff) > Math.PI) {
            const sign = headingDiff >= 0 ? 1 : -1;
            headingDiff = -sign * (2 * Math.PI - Math.abs(headingDiff));
        }
        newHeading = prevHeading + headingDiff;
    }

    positions.appendCoordinate([x, y, newHeading, m]);
    positions.setCoordinates(positions.getCoordinates().slice(-20));
}