import { fromLonLat } from "ol/proj";
import { RMap, ROSM } from "rlayers";
import { INITIAL_CENTER, INITIAL_ZOOM } from '../../constants/map';
import { MapControlButtons } from './MapControlButtons';
import { GeolocationLayer } from './GeolocationLayer';
import './layers.css';

export function MapContainer(): JSX.Element {
    return (
        <>
            <RMap
                className="map"
                initial={{ center: fromLonLat(INITIAL_CENTER), zoom: INITIAL_ZOOM }}
            >
                <MapControlButtons />
                <ROSM />
                <GeolocationLayer />
            </RMap>
        </>
    );
}
