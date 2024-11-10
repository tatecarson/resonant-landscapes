import { useState, useCallback } from "react";
import { LineString } from "ol/geom";
import { RGeolocation, useOL } from "rlayers";
import * as turf from '@turf/turf';
import { useAudioContext } from "../../contexts/AudioContextProvider";
import { Feature } from '@turf/helpers';
import { ErrorBoundary } from "react-error-boundary";
import ParkModal from "../ParkModal";
import { GeolocLayer } from "./GeolocLayer";
import { ParkFeatures } from "./ParkFeatures";
import scaledPoints from "../../js/scaledParks";
import { Park } from "../../types/park";
import { useGeolocation } from "../../hooks/useGeolocation";
import { addPosition } from "../../utils/mapUtils";

export function GeolocComp(): JSX.Element {
    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);
    const [isOpen, setIsOpen] = useState(false);
    const [parkName, setParkName] = useState<string>('');
    const [parkDistance, setParkDistance] = useState<number>(0);
    const [currentParkLocation, setCurrentParkLocation] = useState<[number, number] | null>(null);
    const [userLocation, setUserLocation] = useState<Feature<turf.Point> | null>(null);

    const { resonanceAudioScene, stopSound } = useAudioContext();
    const { map } = useOL();
    const view = map?.getView();
    const positions = new LineString([], 'XYZM');

    const { pos, accuracy, setAccuracy, updateView } = useGeolocation(
        map, view, positions, deltaMean, previousM, setPreviousM, setUserLocation,
        scaledPoints, isOpen, setIsOpen, setParkName, currentParkLocation, setCurrentParkLocation,
        setParkDistance, resonanceAudioScene, stopSound
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

            <GeolocLayer pos={pos} accuracy={accuracy} />
            <ParkFeatures
                scaledPoints={scaledPoints as Park[]}
                maxDistance={15}
                userLocation={userLocation}
                onParkSelect={(name, coords) => {
                    setIsOpen(true);
                    setParkName(name);
                    setCurrentParkLocation(coords);
                }}
                isOpen={isOpen}
            />

            <ErrorBoundary fallback={<div>Error</div>}>
                {isOpen && (
                    <ParkModal
                        isOpen={isOpen}
                        setIsOpen={setIsOpen}
                        parkName={parkName}
                        parkDistance={parkDistance}
                        userOrientation={false}
                    />
                )}
            </ErrorBoundary>
        </>
    );
}