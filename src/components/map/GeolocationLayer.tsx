import { useState, useCallback } from "react";
import { LineString } from "ol/geom";
import { RGeolocation, useOL } from "rlayers";
import * as turf from '@turf/turf';
import { useAudioContext } from "../../contexts/AudioContextProvider";
import { Feature } from '@turf/helpers';
import { GeolocationMarkerLayer } from "./GeolocationMarkerLayer";
import scaledPoints from "../../js/scaledParks";
import { Park } from "../../types/park";
import { useGeolocation } from "../../hooks/useGeolocation";
import { addPosition } from "../../utils/mapUtils";
import { ParkLayer } from "./ParkLayer";

export function GeolocationLayer(): JSX.Element {
    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);
    const [userLocation, setUserLocation] = useState<Feature<turf.Point> | null>(null);

    const { resonanceAudioScene, stopSound } = useAudioContext();
    const { map } = useOL();
    const view = map?.getView();
    const positions = new LineString([], 'XYZM');

    const { pos, accuracy, setAccuracy, updateView } = useGeolocation(
        map, view, positions, deltaMean, previousM, setPreviousM, setUserLocation,
        scaledPoints, false, () => { }, () => { }, null, () => { }, () => { }, resonanceAudioScene, stopSound
    );

    return (
        <>
            <RGeolocation
                tracking={true}
                trackingOptions={{
                    enableHighAccuracy: true,
                }}
                onChange={useCallback(
                    (e: { target: any; }) => {
                        const geoloc = e.target;
                        const position = geoloc.getPosition();
                        if (position) {
                            const [x, y] = position;
                            setAccuracy(new LineString([position]));
                            const m = Date.now();
                            addPosition(positions, [x, y], geoloc.getHeading() ?? 0, m, geoloc.getSpeed() ?? 0);

                            const coords = positions.getCoordinates();
                            const len = coords.length;
                            if (len >= 2) {
                                setDeltaMean((coords[len - 1][3] - coords[0][3]) / (len - 1));
                            }

                            updateView();
                        }
                    },
                    [positions, setAccuracy, setDeltaMean, updateView]
                )}
            />

            <GeolocationMarkerLayer pos={pos} accuracy={accuracy} />
            <ParkLayer
                scaledPoints={scaledPoints as Park[]}
                userLocation={userLocation}
            />
        </>
    );
}