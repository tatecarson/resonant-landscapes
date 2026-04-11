import { memo } from "react";
import { Point } from "ol/geom";
import Circle from "ol/geom/Circle";
import { fromLonLat } from "ol/proj";
import { RFeature, RLayerVector, RPopup, RStyle } from "rlayers";

import marker from "../assets/trees.png";

interface ParkFeature {
    name: string;
    scaledCoords: [number, number];
}

interface ParkFeatureLayersProps {
    parkFeatures: ParkFeature[];
    maxDistance: number;
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

function renderMaxDistanceFeature(scaledCoords: [number, number], key: number, maxDistance: number) {
    const circleGeometry = new Circle(fromLonLat(scaledCoords), maxDistance);

    return (
        <RFeature geometry={circleGeometry} key={key}>
            <RStyle.RStyle>
                <RStyle.RFill color={"rgba(76, 175, 80, 0.2)"} />
                <RStyle.RStroke color={"green"} width={2} />
            </RStyle.RStyle>
        </RFeature>
    );
}

function ParkFeatureLayers({ parkFeatures, maxDistance }: ParkFeatureLayersProps) {
    return (
        <>
            <RLayerVector zIndex={9}>
                {parkFeatures.map((park, index) => renderParkFeature(park.scaledCoords, park.name, index))}
            </RLayerVector>

            <RLayerVector zIndex={10}>
                {parkFeatures.map((park, index) => renderMaxDistanceFeature(park.scaledCoords, index, maxDistance))}
            </RLayerVector>
        </>
    );
}

export default memo(ParkFeatureLayers);
