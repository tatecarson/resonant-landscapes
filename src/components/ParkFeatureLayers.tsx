import { memo } from "react";
import { Point } from "ol/geom";
import { fromLonLat } from "ol/proj";
import { RFeature, RLayerVector, RPopup, RStyle } from "rlayers";

import marker from "../assets/park_marker_dot.svg";
import heardMarker from "../assets/park_marker_dot_heard.svg";

interface ParkFeature {
    name: string;
    scaledCoords: [number, number];
}

interface ParkFeatureLayersProps {
    parkFeatures: ParkFeature[];
    /**
     * Parks the walker has already heard. Passed in rather than read from the
     * store here so this stays a pure render of what it is given, which is
     * what lets the memo() below mean anything.
     */
    heardParks: ReadonlySet<string>;
}

function renderParkFeature(scaledCoords: [number, number], name: string, heard: boolean) {
    const pointGeometry = new Point(fromLonLat(scaledCoords));

    return (
        /*
         * Keyed on the heard state as well as the name, so the feature is
         * rebuilt rather than updated when a park is first heard. OpenLayers
         * cannot change an icon's src after the object is created, and
         * rlayers says so in a console warning rather than an error: the
         * marker simply kept the unheard dot for the rest of the walk.
         */
        <RFeature geometry={pointGeometry} key={`${name}:${heard ? "heard" : "unheard"}`}>
            <RStyle.RStyle>
                <RStyle.RIcon src={heard ? heardMarker : marker} anchor={[0.5, 0.5]} scale={0.72} />
            </RStyle.RStyle>
            <RPopup trigger={"click"} className="example-overlay">
                {name}
            </RPopup>
        </RFeature>
    );
}

function ParkFeatureLayers({ parkFeatures, heardParks }: ParkFeatureLayersProps) {
    return (
        <RLayerVector zIndex={9}>
            {parkFeatures.map((park) =>
                renderParkFeature(park.scaledCoords, park.name, heardParks.has(park.name))
            )}
        </RLayerVector>
    );
}

export default memo(ParkFeatureLayers);
