import React, { useState, useCallback } from "react";
import { fromLonLat } from "ol/proj";
import { Geometry, Point, LineString } from "ol/geom";
import { Geolocation as OLGeoLoc } from "ol";
import "ol/ol.css";
import './layers.css'

import {
    RMap,
    ROSM,
    RLayerVector,
    RFeature,
    RGeolocation,
    RStyle,
    useOL,
} from "rlayers";
import locationIcon from "../assets/geolocation_marker_heading.png";

// modulo for negative values
function mod(n) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

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

        // console.log(c)
        if (c) {
            view.setCenter(getCenterWithHeading([c[0], c[1]], -c[2], view.getResolution() ?? 0));
            view.setRotation(-c[2]);
            setPos(c); // Fix: Pass the coordinate array as an argument to setPos
        }
    }


    return (
        <>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}

                onChange={useCallback(
                    (e) => {
                        const geoloc = e.target as OLGeoLoc;
                        const position = geoloc.getPosition();
                        if (position) {
                            setAccuracy(new LineString([position]));
                            const m = Date.now();
                            addPosition(position, geoloc.getHeading() ?? 0, m, geoloc.getSpeed() ?? 0);

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
