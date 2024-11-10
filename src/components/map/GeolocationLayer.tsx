import React, { useCallback, useState } from 'react';
import { RGeolocation } from 'rlayers';
import { LineString } from 'ol/geom';
import { useGeolocation } from '../../hooks/useGeolocation';
import { GeolocationMarkerLayer } from './GeolocationMarkerLayer';
import { ParkLayer } from './ParkLayer';
import { useOL } from 'rlayers';
import { addPosition } from '../../utils/mapUtils';
import scaledPoints from "../../js/scaledParks";
import { Park } from '../../types/park';
import { useAudioContext } from "../../contexts/AudioContextProvider";

export function GeolocationLayer() {
    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);
    const [isOpen, setIsOpen] = useState(false);
    const [parkName, setParkName] = useState<string>('');
    const [parkDistance, setParkDistance] = useState<number>(0);
    const [currentParkLocation, setCurrentParkLocation] = useState<[number, number] | null>(null);
    const [userLocation, setUserLocation] = useState<any>(null);

    const { map } = useOL();
    const view = map?.getView();

    const { resonanceAudioScene, stopSound } = useAudioContext();

    const positions = new LineString([], 'XYZM');

    const { pos, accuracy, setAccuracy, updateView } = useGeolocation(
        map, view, positions, deltaMean, previousM, setPreviousM, setUserLocation, scaledPoints, isOpen, setIsOpen, setParkName, currentParkLocation, setCurrentParkLocation, setParkDistance, resonanceAudioScene, stopSound
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
                parkName={parkName}
                parkDistance={parkDistance}
            />
        </>
    );
}