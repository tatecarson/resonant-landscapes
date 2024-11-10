import { RLayerVector, RStyle, RFeature, RPopup } from "rlayers";
import Circle from 'ol/geom/Circle';
import { Point } from "ol/geom";
import { fromLonLat } from "ol/proj";
import * as turf from '@turf/turf';

import { Park } from '../../types/park';
import marker from '../../assets/trees.png';

interface ParkFeaturesProps {
    scaledPoints: Park[];
    maxDistance: number;
    userLocation: turf.Point | null;
    onParkSelect: (name: string, coords: [number, number]) => void;
    isOpen: boolean;
}

export function ParkFeatures({
    scaledPoints,
    maxDistance,
    userLocation,
    onParkSelect,
    isOpen
}: ParkFeaturesProps): JSX.Element {

    const checkParkDistance = (park: typeof scaledPoints[0]) => {
        if (!userLocation) return;

        const parkLocation = turf.point(park.scaledCoords);
        const distance = turf.distance(userLocation, parkLocation, { units: 'meters' });

        if (distance < maxDistance && !isOpen) {
            onParkSelect(park.name, park.scaledCoords);
        }
    };

    return (
        <>
            <RLayerVector zIndex={9}>
                {scaledPoints.map((park, i) => (
                    <RFeature
                        geometry={new Point(fromLonLat(park.scaledCoords))}
                        key={i}
                        onClick={() => checkParkDistance(park)}
                    >
                        <RStyle.RStyle>
                            <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />
                        </RStyle.RStyle>
                        <RPopup trigger={"click"} className="example-overlay">
                            {park.name}
                        </RPopup>
                    </RFeature>
                ))}
            </RLayerVector>
            <RLayerVector zIndex={10}>
                {scaledPoints.map((park, i) => (
                    <RFeature
                        geometry={new Circle(fromLonLat(park.scaledCoords), maxDistance)}
                        key={i}
                    >
                        <RStyle.RStyle>
                            <RStyle.RFill color={"rgba(76, 175, 80, 0.2)"} />
                            <RStyle.RStroke color={"green"} width={2} />
                        </RStyle.RStyle>
                    </RFeature>
                ))}
            </RLayerVector>
        </>
    );
}