import { memo } from "react";
import { Point } from "ol/geom";
import { fromLonLat } from "ol/proj";
import { RFeature, RLayerVector, RPopup, RStyle } from "rlayers";

import marker from "../assets/trees.png";

interface ParkFeature {
    name: string;
    scaledCoords: [number, number];
}

interface ParkFeatureLayersProps {
    parkFeatures: ParkFeature[];
}

function renderParkFeature(scaledCoords: [number, number], name: string, key: number) {
    const pointGeometry = new Point(fromLonLat(scaledCoords));

    return (
        <RFeature geometry={pointGeometry} key={key}>
            <RStyle.RStyle>
                <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />
            </RStyle.RStyle>
            <RPopup trigger={"click"} className="example-overlay">
                {name}
            </RPopup>
        </RFeature>
    );
}

function ParkFeatureLayers({ parkFeatures }: ParkFeatureLayersProps) {
    return (
        <RLayerVector zIndex={9}>
            {parkFeatures.map((park, index) => renderParkFeature(park.scaledCoords, park.name, index))}
        </RLayerVector>
    );
}

export default memo(ParkFeatureLayers);
