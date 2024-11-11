import React from 'react';
import { Point, LineString } from 'ol/geom';
import { RLayerVector, RFeature, RStyle } from 'rlayers';
import locationIcon from '../../../assets/geolocation_marker_heading.png';

interface LocationLayerProps {
    pos: Point;
    accuracy: LineString | null;
}

export function LocationLayer({ pos, accuracy }: LocationLayerProps) {
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