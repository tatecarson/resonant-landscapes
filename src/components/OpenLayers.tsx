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

import scaledPoints from "../js/scaledParks";
import marker from '../assets/trees.png'
import locationIcon from "../assets/geolocation_marker_heading.png";
import { ErrorBoundary } from "react-error-boundary";

// modulo for negative values
function mod(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function degToRad(deg: number) {
    return (deg * Math.PI) / 180;
}

function GeolocComp(): JSX.Element {

    const [pos, setPos] = useState(new Point(fromLonLat([0, 0]), 'XYZM'));
    const [accuracy, setAccuracy] = useState<LineString | null>(null);
    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);

    const [isOpen, setIsOpen] = useState(false)
    const [parkName, setParkName] = useState<string>('');
    const [parkDistance, setParkDistance] = useState<number>(0);
    const [currentParkLocation, setCurrentParkLocation] = useState([]);
    const [enableUserOrientation, setEanbleUserOrientation] = useState(false);

    const { resonanceAudioScene, stopSound } = useAudioContext();

    const positions = new LineString([], 'XYZM');

    // Low-level access to the OpenLayers API
    const { map } = useOL();

    const view = map?.getView();

    const maxDistance = 15; // meters

    function addPosition(position: [number, number], heading: number, m: number, speed: number) {
        if (!position) return; // Guard clause if position is not provided

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

        // console.count('updateView() called');
        let m = Date.now() - deltaMean * 1.5;
        m = Math.max(m, previousM);
        setPreviousM(m);

        const c = positions.getCoordinateAtM(m, true);

        if (c) {
            view.setCenter(getCenterWithHeading([c[0], c[1]], -c[2], view.getResolution() ?? 0));
            view.setRotation(-c[2]);
            setPos(c);

            const userLocation = turf.point(toLonLat([c[0], c[1]]));
            scaledPoints.forEach(park => {
                // console.log("park", park.name, park.scaledCoords)
                const parkLocation = turf.point(park.scaledCoords);
                const distance = turf.distance(userLocation, parkLocation, { units: 'meters' });
                if (distance < maxDistance && !isOpen) {
                    setIsOpen(true);
                    console.count('isOpen set to true');
                    setParkName(park.name);
                    setCurrentParkLocation(parkLocation);
                }
            });

            const currentParkDistance = turf.distance(currentParkLocation, userLocation, { units: 'meters' });

            if (currentParkDistance < maxDistance) {
                setParkDistance(currentParkDistance);

                if (resonanceAudioScene) {
                    console.log("Setting listener position to ", currentParkDistance, currentParkDistance, 0)
                    resonanceAudioScene.setListenerPosition(currentParkDistance, currentParkDistance, 0);
                }

                // minDistance
                if (currentParkDistance < 5) {
                    console.log("User is close to ", parkName)
                    setEanbleUserOrientation(true);
                } else {
                    setEanbleUserOrientation(false);
                }
            }
            // reset if the user walks away from the park center
            if (currentParkDistance > maxDistance && isOpen) {
                setIsOpen(false);
                stopSound();
            }
        }
    }


    function createParkFeature(scaledCoords: [number, number], name: string, key: number) {
        // console.log("scaledCoords", scaledCoords, name)
        const pointGeometry = new Point(fromLonLat(scaledCoords));
        return (
            <RFeature geometry={pointGeometry} key={key}>
                <RStyle.RStyle>

                    <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />
                </RStyle.RStyle>
                <RPopup trigger={"click"} className="example-overlay">
                    {name}
                </RPopup>
            </RFeature>
        );
    }

    function createMaxDistanceFeature(scaledCoords: [number, number], name: string, key: number) {
        const circleGeometry = new Circle(fromLonLat(scaledCoords), maxDistance);
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

            <RLayerVector zIndex={10}>
                <RStyle.RStyle>
                    <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} />
                    <RStyle.RStroke color={"#007bff"} width={3} />
                </RStyle.RStyle>
                {pos && <RFeature geometry={new Point(pos)}></RFeature>}
                {accuracy && <RFeature geometry={accuracy}></RFeature>}
            </RLayerVector>

            <RLayerVector zIndex={9}>
                {scaledPoints.map((park, i) => createParkFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>

            <RLayerVector zIndex={10}>
                {scaledPoints.map((park, i) => createMaxDistanceFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>
            <ErrorBoundary fallback={<div>Error</div>}>
                {isOpen && <ParkModal isOpen={isOpen} setIsOpen={setIsOpen} parkName={parkName} parkDistance={parkDistance} userOrientation={enableUserOrientation} />}
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
