import { memo } from "react";
import { Point } from "ol/geom";
import { fromLonLat } from "ol/proj";
import { RFeature, RLayerVector, RPopup, RStyle } from "rlayers";

import marker from "../assets/park_marker_dot.svg";
import heardMarker from "../assets/park_marker_dot_heard.svg";
import cachedMarker from "../assets/park_marker_dot_cached.svg";
import heardCachedMarker from "../assets/park_marker_dot_heard_cached.svg";

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
    /**
     * Parks whose audio the walk holds on disk, passed for the same reason.
     * Cached is not heard — a prefetch can complete for a park the walker
     * never enters, and eviction can take a park the heard record still
     * counts — so the two rings of state are shown independently.
     */
    cachedParks: ReadonlySet<string>;
}

function markerFor(heard: boolean, cached: boolean) {
    if (heard) return cached ? heardCachedMarker : heardMarker;
    return cached ? cachedMarker : marker;
}

function renderParkFeature(scaledCoords: [number, number], name: string, heard: boolean, cached: boolean) {
    const pointGeometry = new Point(fromLonLat(scaledCoords));

    return (
        /*
         * Keyed on both states as well as the name, so the feature is
         * rebuilt rather than updated when either changes. OpenLayers
         * cannot change an icon's src after the object is created, and
         * rlayers says so in a console warning rather than an error: the
         * marker simply kept its first look for the rest of the walk.
         */
        <RFeature geometry={pointGeometry} key={`${name}:${heard ? "heard" : "unheard"}:${cached ? "cached" : "uncached"}`}>
            <RStyle.RStyle>
                <RStyle.RIcon src={markerFor(heard, cached)} anchor={[0.5, 0.5]} scale={0.72} />
            </RStyle.RStyle>
            <RPopup trigger={"click"} className="example-overlay">
                {name}
            </RPopup>
        </RFeature>
    );
}

function ParkFeatureLayers({ parkFeatures, heardParks, cachedParks }: ParkFeatureLayersProps) {
    return (
        <RLayerVector zIndex={9}>
            {parkFeatures.map((park) =>
                renderParkFeature(
                    park.scaledCoords,
                    park.name,
                    heardParks.has(park.name),
                    cachedParks.has(park.name),
                )
            )}
        </RLayerVector>
    );
}

export default memo(ParkFeatureLayers);
