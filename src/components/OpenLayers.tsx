import React, { useState } from "react";
import { RMap, ROSM } from "rlayers";
import { fromLonLat } from "ol/proj";
import "ol/ol.css";
import { MapControls } from "./map/MapControls";
import { GeolocComp } from './map/GeolocComp';

export default function Geolocation(): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false);

    return (
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
    );
}
