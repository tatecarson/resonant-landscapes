import { RLayerVector, RStyle, RFeature, RPopup } from "rlayers";
import Circle from 'ol/geom/Circle';
import { Point } from "ol/geom";
import { fromLonLat } from "ol/proj";
import marker from '../../assets/trees.png';
import { MAX_DISTANCE } from '../../constants/map';

interface ParkFeaturesProps {
    scaledPoints: Array<{
        scaledCoords: [number, number];
        name: string;
    }>;
}

export function ParkFeatures({ scaledPoints }: ParkFeaturesProps): JSX.Element {
    return (
        <>
            <RLayerVector zIndex={9}>
                {scaledPoints.map((park, i) => (
                    <RFeature
                        geometry={new Point(fromLonLat(park.scaledCoords))}
                        key={i}
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
                        geometry={new Circle(fromLonLat(park.scaledCoords), MAX_DISTANCE)}
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