import React, { useState, useCallback } from "react";
import { fromLonLat, to } from "ol/proj";
import { Geometry, Point, LineString } from "ol/geom";
import { Geolocation as OLGeoLoc } from "ol";
import * as turf from "@turf/turf";
import "ol/ol.css";
import './layers.css'

import {
    RMap,
    ROSM,
    RLayerVector,
    RFeature,
    RGeolocation,
    RStyle,
    ROverlay,
    useOL,
} from "rlayers";
import locationIcon from "../assets/geolocation_marker_heading.png";
import marker from '../assets/react.svg'

// modulo for negative values
function mod(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}


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
const scaleLong = 0.000660;

// Assuming a reference point (for example, the center of DSU campus)
const referencePoint = turf.point([-97.111488, 44.012222]);

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

console.log(scaledPoints)

function GeolocComp(): JSX.Element {
    const [pos, setPos] = useState(new Point(fromLonLat([0, 0]), 'XYZM'));
    const [accuracy, setAccuracy] = useState<LineString | null>(null);
    // const [heading, setHeading] = useState<number>(0);
    // const [speed, setSpeed] = useState<number>(0);

    const positions = new LineString([], 'XYZM');

    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);

    // Low-level access to the OpenLayers API
    const { map } = useOL();

    const view = map?.getView();

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
        }
    }



    function createParkFeature(scaledCoords: [number, number], name: string, key: number) {
        return (
            // FIXME: Add a key prop
            <RFeature
                geometry={new Point(fromLonLat(scaledCoords))} key={key}>
                <ROverlay className="example-overlay">
                    {name} {key}
                </ROverlay>
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
                <RStyle.RStyle>
                    <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />
                    <RStyle.RStroke color={"#007bff"} width={3} />
                </RStyle.RStyle>

                {scaledPoints && scaledPoints.map((park, i) => createParkFeature(park.scaledCoords, park.name, i))}

            </RLayerVector>


        </>
    );
}


export default function Geolocation(): JSX.Element {
    return (
        <RMap
            className="map"
            initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
        >
            <ROSM />
            <GeolocComp />


        </RMap>
    );
}
