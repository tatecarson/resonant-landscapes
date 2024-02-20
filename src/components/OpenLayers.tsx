import React, { useState, useEffect, useCallback } from "react";
import { fromLonLat, toLonLat } from "ol/proj";
import { Geometry, Point, LineString } from "ol/geom";
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
} from "rlayers";
import * as turf from '@turf/turf';


import ParkModal from "./ParkModal";
import "ol/ol.css";
import './layers.css'

import scaledPoints from "../js/scaledParks";
import locationIcon from "../assets/geolocation_marker_heading.png";
import marker from '../assets/trees.png'

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
    const [simulationData, setSimulationData] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0); // New state for tracking current index

    const [isOpen, setIsOpen] = useState(false)
    const [parkName, setParkName] = useState<string>('');

    const positions = new LineString([], 'XYZM');

    // Low-level access to the OpenLayers API
    const { map } = useOL();

    const view = map?.getView();

    useEffect(() => {
        fetch('data/geolocation-orientation.json') // Adjust path if necessary
            .then((response) => response.json())
            .then((data) => setSimulationData(data.data));
    }, []);



    // Function to move to the next simulation step
    const nextStep = useCallback(() => {
        if (!simulationData || currentIndex >= simulationData.length - 1) return;

        const newIndex = currentIndex + 1;
        simulateStep(newIndex);
        setCurrentIndex(newIndex);
    }, [currentIndex, simulationData]);

    // Function to move to the previous simulation step
    const prevStep = useCallback(() => {
        if (!simulationData || currentIndex <= 0) return;

        const newIndex = currentIndex - 1;
        simulateStep(newIndex);
        setCurrentIndex(newIndex);
    }, [currentIndex, simulationData]);

    // Function to simulate a specific step based on index
    const simulateStep = (index: number) => {
        const { coords, timestamp } = simulationData[index];
        const projectedPosition = fromLonLat([coords.longitude, coords.latitude]);
        // Your logic to update position and view based on the new step...
        addPosition([projectedPosition[0], projectedPosition[1]], degToRad(coords.heading), Date.now(), coords.speed);

        updateView(); // Ensure this function updates the view correctly based on the new index
    };

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
        if (!view) return; // Guard clause if view is not available

        let m = Date.now() - deltaMean * 1.5;
        m = Math.max(m, previousM);
        setPreviousM(m);

        const c = positions.getCoordinateAtM(m, true);

        if (c) {
            view.setCenter(getCenterWithHeading([c[0], c[1]], -c[2], view.getResolution() ?? 0));
            view.setRotation(-c[2]);
            setPos(c); // Fix: Pass the coordinate array as an argument to setPos

            // TODO: test this IRL 
            // Added it up here so it doesn't get called too often
            const userLocation = turf.point(toLonLat([c[0], c[1]]));
            // console.log("userLocation", userLocation)
            scaledPoints.forEach(park => {
                const parkLocation = turf.point(park.scaledCoords);
                const distance = turf.distance(userLocation, parkLocation, { units: 'meters' });
                // console.log("distance", distance, "to ", park.name)
                if (distance < 10) {
                    setIsOpen(true)
                    setParkName(park.name)
                }
            })
        }
    }

    function createParkFeature(scaledCoords: [number, number], name: string, key: number) {
        return (
            <RFeature
                geometry={new Point(fromLonLat(scaledCoords))} key={key}>
                <RPopup trigger={"click"} className="example-overlay">
                    {name}
                </RPopup>
            </RFeature>
        );
    }

    return (
        <>
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
                            // addPosition([x, y], geoloc.getHeading() ?? 0, m, geoloc.getSpeed() ?? 0); // Pass [x, y] as the position

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
                <RStyle.RStyle>
                    <RStyle.RCircle radius={5} />
                    <RStyle.RStroke color={"#000"} width={10} />
                    <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />

                </RStyle.RStyle>

                {scaledPoints.map((park, i) => createParkFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>
            {isOpen && <ParkModal isOpen={isOpen} setIsOpen={setIsOpen} parkName={parkName} />}
            {/* <button onClick={simulateGeolocation}>Simulate Movement</button> */}
            <button onClick={prevStep}>Previous Step</button>
            <button onClick={nextStep}>Next Step</button>
        </>
    );
}


export default function Geolocation(): JSX.Element {
    return (
        <>
            <RMap
                className="map"
                initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
            >
                <ROSM />
                <GeolocComp />
            </RMap>

        </>
    );
}
