import { useState, useCallback } from "react";
import { Point, LineString } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import { Geolocation as OLGeoLoc } from "ol";
import { RGeolocation, useOL } from "rlayers";
import * as turf from '@turf/turf';
import { useAudioContext } from "../../contexts/AudioContextProvider";
import { Feature } from '@turf/helpers';
import { ErrorBoundary } from "react-error-boundary";
import ParkModal from "../ParkModal";
import { GeolocLayer } from "./GeolocLayer";
import { ParkFeatures } from "./ParkFeatures";
import { mod } from "../../utils/geolocation";
import scaledPoints from "../../js/scaledParks";
import { Park } from "../../types/park";

export function GeolocComp(): JSX.Element {
    const [pos, setPos] = useState(new Point(fromLonLat([0, 0]), 'XYZM'));
    const [accuracy, setAccuracy] = useState<LineString | null>(null);
    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);

    const [isOpen, setIsOpen] = useState(false);
    const [parkName, setParkName] = useState<string>('');
    const [parkDistance, setParkDistance] = useState<number>(0);
    const [currentParkLocation, setCurrentParkLocation] = useState<[number, number] | null>(null);
    const [enableUserOrientation, setEanbleUserOrientation] = useState(false);
    const [userLocation, setUserLocation] = useState<Feature<turf.Point> | null>(null);

    const { resonanceAudioScene, stopSound } = useAudioContext();
    const { map } = useOL();
    const view = map?.getView();

    const maxDistance = 15; // meters
    const positions = new LineString([], 'XYZM');

    /**
     * Adds a new position to the tracking history with heading calculations.
     * This function:
     * 1. Maintains a history of recent positions (max 20 points)
     * 2. Calculates smooth heading transitions between points
     * 3. Stores coordinates in format: [x, y, heading, timestamp]
     * 
     * @param position - [x, y] coordinates in current projection
     * @param heading - Current heading in radians
     * @param m - Timestamp in milliseconds
     * @param speed - Current speed (not used currently)
     */
    function addPosition(position: [number, number], heading: number, m: number, speed: number) {
        if (!position) return; // Guard clause if position is not provided

        const x = position[0];
        const y = position[1];
        const fCoords = positions.getCoordinates();
        const previous = fCoords[fCoords.length - 1];
        const prevHeading = previous && previous[2];
        let newHeading = heading;

        // Calculate smooth heading transition if we have a previous heading
        if (prevHeading !== undefined) {
            let headingDiff = newHeading - mod(prevHeading);

            // Ensure we take the shortest path around the circle
            if (Math.abs(headingDiff) > Math.PI) {
                const sign = headingDiff >= 0 ? 1 : -1;
                headingDiff = -sign * (2 * Math.PI - Math.abs(headingDiff));
            }
            newHeading = prevHeading + headingDiff;
        }

        // Add new position to history: [x, y, heading, timestamp]
        positions.appendCoordinate([x, y, newHeading, m]);

        // Keep only last 20 positions
        positions.setCoordinates(positions.getCoordinates().slice(-20));
    }

    // recenters the view by putting the given coordinates at 3/4 from the top or
    // the screen
    function getCenterWithHeading(position: [number, number], rotation: number, resolution: number) {
        const size = map?.getSize();
        if (!size) return position; // Return early if map size is not available

        const height = size[1];

        return [
            position[0] - (Math.sin(rotation) * height * resolution * 1) / 4,
            position[1] + (Math.cos(rotation) * height * resolution * 1) / 4,
        ];
    }

    function updateView() {
        if (!view) return;

        let m = Date.now() - deltaMean * 1.5;
        m = Math.max(m, previousM);
        setPreviousM(m);
        const c = positions.getCoordinateAtM(m, true);

        if (c) {
            view.setCenter(getCenterWithHeading([c[0], c[1]], -c[2], view.getResolution() ?? 0));
            view.setRotation(-c[2]);
            setPos(c);

            // Convert coordinates and update userLocation state
            const coordinates = toLonLat([c[0], c[1]]);
            setUserLocation(turf.point([coordinates[0], coordinates[1]]));

            // Convert OpenLayers coordinates to [longitude, latitude] format for turf
            const userLocation = coordinates ? turf.point([coordinates[0], coordinates[1]]) : null;

            scaledPoints.forEach(park => {
                // Create a turf point from park coordinates
                const parkLocation = turf.point(park.scaledCoords);

                try {
                    const distance = turf.distance(userLocation, parkLocation, { units: 'meters' });
                    if (distance < maxDistance && !isOpen) {
                        setIsOpen(true);
                        setParkName(park.name);
                        // Store just the coordinates instead of the whole point feature
                        setCurrentParkLocation(park.scaledCoords);
                    }
                } catch (error) {
                    console.error('Error calculating distance:', error);
                    console.log('User coordinates:', coordinates);
                    console.log('Park coordinates:', park.scaledCoords);
                }
            });

            if (currentParkLocation) {
                const currentParkDistance = turf.distance(userLocation, turf.point(currentParkLocation), { units: 'meters' });
                if (currentParkDistance < maxDistance) {
                    setParkDistance(currentParkDistance);
                    if (resonanceAudioScene) {
                        resonanceAudioScene.setListenerPosition(currentParkDistance, currentParkDistance, 0);
                    }
                    setEanbleUserOrientation(currentParkDistance < 5);
                }
                // Reset if user walks away from park center
                if (currentParkDistance > maxDistance && isOpen) {
                    setIsOpen(false);
                    stopSound();
                }
            }
        }
    }

    return (
        <>
            <RGeolocation
                tracking={true}
                trackingOptions={{
                    enableHighAccuracy: true,
                }}
                onChange={useCallback(
                    (e: { target: OLGeoLoc; }) => {
                        const geoloc = e.target as OLGeoLoc;
                        const position = geoloc.getPosition();
                        if (position) {
                            const [x, y] = position; // Destructure the position into x and y coordinates
                            setAccuracy(new LineString([position]));
                            const m = Date.now();
                            // this line enables the geolocation feature 
                            addPosition([x, y], geoloc.getHeading() ?? 0, m, geoloc.getSpeed() ?? 0); // Pass [x, y] as the position

                            const coords = positions.getCoordinates();
                            const len = coords.length;
                            if (len >= 2) {
                                setDeltaMean((coords[len - 1][3] - coords[0][3]) / (len - 1));
                            }

                            updateView();

                        }
                    },
                    [positions, map] // Dependency array updated
                )}
            />

            <GeolocLayer pos={pos} accuracy={accuracy} />
            <ParkFeatures
                scaledPoints={scaledPoints as Park[]}
                maxDistance={maxDistance}
                userLocation={userLocation}
                onParkSelect={(name, coords) => {
                    setIsOpen(true);
                    setParkName(name);
                    setCurrentParkLocation(coords);
                }}
                isOpen={isOpen}
            />

            <ErrorBoundary fallback={<div>Error</div>}>
                {isOpen && (
                    <ParkModal
                        isOpen={isOpen}
                        setIsOpen={setIsOpen}
                        parkName={parkName}
                        parkDistance={parkDistance}
                        userOrientation={enableUserOrientation}
                    />
                )}
            </ErrorBoundary>
        </>
    );
}