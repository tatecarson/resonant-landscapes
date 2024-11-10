import { Point, LineString } from "ol/geom";
import { RLayerVector, RStyle, RFeature } from "rlayers";
import locationIcon from "../../assets/geolocation_marker_heading.png";

interface GeolocLayerProps {
    pos: Point;
    accuracy: LineString | null;
}

export function GeolocLayer({ pos, accuracy }: GeolocLayerProps): JSX.Element {
    return (
        <RLayerVector zIndex={10}>
            <RStyle.RStyle>
                <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} />
                <RStyle.RStroke color={"#007bff"} width={3} />
            </RStyle.RStyle>
            {pos && <RFeature geometry={new Point(pos)}></RFeature>}
            {accuracy && <RFeature geometry={accuracy}></RFeature>}
        </RLayerVector>
    );
}