import React, { useState, useEffect, useCallback, memo, useRef, useContext } from "react";
import { fromLonLat, toLonLat } from "ol/proj";
import { Geometry, Point, LineString } from "ol/geom";
import Circle from 'ol/geom/Circle';
import { Geolocation as OLGeoLoc } from "ol";
import {
    RMap,
    ROSM,
    RLayerVector,
    RFeature,
    RGeolocation,
    RStyle,
    ROverlay,
    useOL,
    RPopup,
    RControl
} from "rlayers";
import * as turf from '@turf/turf';

import ParkModal from "./ParkModal";
import "ol/ol.css";
import './layers.css'

import { useAudioContext } from "../contexts/AudioContextProvider";
import HelpMenu from "./HelpModal";

import scaledParkCoordinates from "../js/scaledParks";
import marker from '../assets/trees.png'
import locationIcon from "../assets/geolocation_marker_heading.png";
import { ErrorBoundary } from "react-error-boundary";

// modulo for negative values
function normalizeAngle(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function degToRad(deg: number) {
    return (deg * Math.PI) / 180;
}

function GeolocComp(): JSX.Element {

    const [userLocation, setUserLocation] = useState(new Point(fromLonLat([0, 0]), 'XYZM'));
    const [locationAccuracy, setLocationAccuracy] = useState<LineString | null>(null);
    const [positionUpdateInterval, setPositionUpdateInterval] = useState<number>(500);
    const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<number>(0);

    const [isParkModalOpen, setParkModalOpen] = useState(false)
    const [selectedParkName, setSelectedParkName] = useState<string>('');
    const [distanceToPark, setDistanceToPark] = useState<number>(0);
    const [selectedParkCoordinates, setSelectedParkCoordinates] = useState([]);
    const [isUserOrientationEnabled, setUserOrientationEnabled] = useState(false);

    const { resonanceAudioScene, stopSound } = useAudioContext();

    const userTrajectory = new LineString([], 'XYZM');

    // Low-level access to the OpenLayers API
    const { map } = useOL();

    const mapView = map?.getView();

    const MAX_PARK_INTERACTION_DISTANCE = 15; // meters

    function updateUserTrajectory(
        geoPosition: [number, number],
        compassHeading: number,
        timestamp: number,
        movementSpeed: number
    ) {
        if (!geoPosition) return;

        const longitude = geoPosition[0];
        const latitude = geoPosition[1];

        const trajectoryCoordinates = userTrajectory.getCoordinates();
        const lastPosition = trajectoryCoordinates[trajectoryCoordinates.length - 1];
        const previousHeading = lastPosition && lastPosition[2];

        let calculatedHeading = compassHeading;

        if (previousHeading !== undefined) {
            let headingAngleDifference = calculatedHeading - normalizeAngle(previousHeading);

            if (Math.abs(headingAngleDifference) > Math.PI) {
                const rotationDirection = headingAngleDifference >= 0 ? 1 : -1;
                headingAngleDifference = -rotationDirection * (2 * Math.PI - Math.abs(headingAngleDifference));
            }
            calculatedHeading = previousHeading + headingAngleDifference;
        }

        userTrajectory.appendCoordinate([longitude, latitude, calculatedHeading, timestamp]);

        // Keep only last 20 positions
        userTrajectory.setCoordinates(userTrajectory.getCoordinates().slice(-20));
    }

    // recenters the view by putting the given coordinates at 3/4 from the top or
    // the screen
    function getRecenteredPosition(position: [number, number], rotation: number, resolution: number) {
        const mapSize = map?.getSize();
        if (!mapSize) return position; // Return early if map size is not available

        const mapHeight = mapSize[1];

        return [
            position[0] - (Math.sin(rotation) * mapHeight * resolution * 1) / 4,
            position[1] + (Math.cos(rotation) * mapHeight * resolution * 1) / 4,
        ];
    }

    function refreshUserView() {
        if (!mapView) return;

        // console.count('updateView() called');
        let timestampThreshold = Date.now() - positionUpdateInterval * 1.5;
        timestampThreshold = Math.max(timestampThreshold, lastUpdateTimestamp);
        setLastUpdateTimestamp(timestampThreshold);

        const coordinateAtTimestamp = userTrajectory.getCoordinateAtM(timestampThreshold, true);

        if (coordinateAtTimestamp) {
            mapView.setCenter(getRecenteredPosition([coordinateAtTimestamp[0], coordinateAtTimestamp[1]], -coordinateAtTimestamp[2], mapView.getResolution() ?? 0));
            mapView.setRotation(-coordinateAtTimestamp[2]);
            setUserLocation(coordinateAtTimestamp);

            const userLocation = turf.point(toLonLat([coordinateAtTimestamp[0], coordinateAtTimestamp[1]]));
            scaledParkCoordinates.forEach(park => {
                const parkCoordinates = turf.point(park.scaledCoords);
                const userToParkDistance = turf.distance(userLocation, parkCoordinates, { units: 'meters' });
                if (userToParkDistance < MAX_PARK_INTERACTION_DISTANCE && !isParkModalOpen) {
                    setParkModalOpen(true);
                    setSelectedParkName(park.name);
                    setSelectedParkCoordinates(parkCoordinates);
                }
            });

            const currentParkDistance = turf.distance(selectedParkCoordinates, userLocation, { units: 'meters' });

            if (currentParkDistance < MAX_PARK_INTERACTION_DISTANCE) {
                setDistanceToPark(currentParkDistance);

                if (resonanceAudioScene) {
                    console.log("Setting listener position to ", currentParkDistance, currentParkDistance, 0)
                    resonanceAudioScene.setListenerPosition(currentParkDistance, currentParkDistance, 0);
                }

                // minDistance
                if (currentParkDistance < 5) {
                    console.log("User is close to ", selectedParkName)
                    setUserOrientationEnabled(true);
                } else {
                    setUserOrientationEnabled(false);
                }
            }
            // reset if the user walks away from the park center
            if (currentParkDistance > MAX_PARK_INTERACTION_DISTANCE && isParkModalOpen) {
                setParkModalOpen(false);
                stopSound();
            }
        }
    }


    function createParkIconFeature(scaledCoords: [number, number], parkName: string, uniqueId: number) {
        // console.log("scaledCoords", scaledCoords, name)
        const locationPoint = new Point(fromLonLat(scaledCoords));
        return (
            <RFeature geometry={locationPoint} key={uniqueId}>
                <RStyle.RStyle>

                    <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />
                </RStyle.RStyle>
                <RPopup trigger={"click"} className="example-overlay">
                    {parkName}
                </RPopup>
            </RFeature>
        );
    }

    function createMaxDistanceFeature(scaledCoords: [number, number], name: string, key: number) {
        const circleGeometry = new Circle(fromLonLat(scaledCoords), MAX_PARK_INTERACTION_DISTANCE);
        return (
            <RFeature geometry={circleGeometry} key={key}>
                <RStyle.RStyle>
                    <RStyle.RFill color={"rgba(76, 175, 80, 0.2)"} />
                    <RStyle.RStroke color={"green"} width={2} />
                </RStyle.RStyle>
            </RFeature>
        );
    }

    return (

        <div>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}

                onChange={useCallback(
                    (e: { target: OLGeoLoc; }) => {
                        const geoloc = e.target as OLGeoLoc;
                        const position = geoloc.getPosition();
                        if (position) {
                            const [x, y] = position; // Destructure the position into x and y coordinates
                            setLocationAccuracy(new LineString([position]));
                            const m = Date.now();
                            // this line enables the geolocation feature 
                            updateUserTrajectory([x, y], geoloc.getHeading() ?? 0, m, geoloc.getSpeed() ?? 0); // Pass [x, y] as the position

                            const coords = userTrajectory.getCoordinates();
                            const len = coords.length;
                            if (len >= 2) {
                                setPositionUpdateInterval((coords[len - 1][3] - coords[0][3]) / (len - 1));
                            }

                            refreshUserView();

                        }
                    },
                    [userTrajectory, map] // Dependency array updated
                )}
            />

            <RLayerVector zIndex={10}>
                <RStyle.RStyle>
                    <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} />
                    <RStyle.RStroke color={"#007bff"} width={3} />
                </RStyle.RStyle>
                {userLocation && <RFeature geometry={new Point(userLocation)}></RFeature>}
                {locationAccuracy && <RFeature geometry={locationAccuracy}></RFeature>}
            </RLayerVector>

            <RLayerVector zIndex={9}>
                {scaledParkCoordinates.map((park, i) => createParkIconFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>

            <RLayerVector zIndex={10}>
                {scaledParkCoordinates.map((park, i) => createMaxDistanceFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>
            <ErrorBoundary fallback={<div>Error</div>}>
                {isParkModalOpen && <ParkModal isOpen={isParkModalOpen} setIsOpen={setParkModalOpen} parkName={selectedParkName} parkDistance={distanceToPark} userOrientation={isUserOrientationEnabled} />}
            </ErrorBoundary>

        </div>

    );
}


export default function Geolocation(): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false)

    return (
        <>

            <RMap
                className="map"
                initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
            >
                <RControl.RCustom className="example-control">
                    <button onClick={() => setHelpIsOpen(true)}>
                        ?
                    </button>
                </RControl.RCustom>
                {helpIsOpen && <HelpMenu isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
                <ROSM />
                <GeolocComp />

            </RMap>

        </>
    );
}
