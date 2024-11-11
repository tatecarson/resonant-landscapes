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
import { MapControls } from "./map/MapControls";
import { GeolocComp } from './map/GeolocComp';

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


export default function Geolocation(): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false);

    return (
        <>
            <RMap
                className="map"
                initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
            >
                <MapControls
                    helpIsOpen={helpIsOpen}
                    setHelpIsOpen={setHelpIsOpen}
                />
                <ROSM />
                <GeolocComp />
            </RMap>
        </>
    );
}
