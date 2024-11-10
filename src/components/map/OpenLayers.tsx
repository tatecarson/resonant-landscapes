import { fromLonLat } from "ol/proj";
import { RMap, ROSM } from "rlayers";
import { INITIAL_CENTER, INITIAL_ZOOM } from '../../constants/map';
import { MapControls } from './MapControls';
import { GeolocComp } from './GeolocComp';
import './layers.css';

export function OpenLayers(): JSX.Element {
    return (
        <>
            <RMap
                className="map"
                initial={{ center: fromLonLat(INITIAL_CENTER), zoom: INITIAL_ZOOM }}
            >
                <MapControls />
                <ROSM />
                <GeolocComp />
            </RMap>
        </>
    );
}
