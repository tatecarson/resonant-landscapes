import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString, Point } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import {
    RControl,
    RFeature,
    RGeolocation,
    RLayerVector,
    RMap,
    ROSM,
    RStyle,
    useOL,
} from "rlayers";
import { ErrorBoundary } from "react-error-boundary";

import "ol/ol.css";
import "./layers.css";

import HelpModal from "./HelpModal";
import ParkModal from "./ParkModal";
import ParkFeatureLayers from "./ParkFeatureLayers";
import GeolocationDebugPanel from "./GeolocationDebugPanel";
import { useAudioContext, useAudioEngine } from "../contexts/AudioContextProvider";
import { useGeolocationTracking } from "../hooks/useGeolocationTracking";
import { useRenderDebug } from "../hooks/useRenderDebug";
import stateParks from "../data/stateParks.json";
import { pickSoundPath } from "../utils/audioPaths";
import scaledPoints, { testPark } from "../utils/scaledParks";
import locationIcon from "../assets/geolocation_marker_heading.png";

/**
 * Compute an adjusted map center that offsets the given position based on heading, viewport height, and map resolution.
 *
 * @param map - The OpenLayers map instance (used to obtain the viewport size). If the map or its size is unavailable, `position` is returned unchanged.
 * @param position - The base center coordinate as [x, y].
 * @param rotation - Heading/rotation in radians used to determine the offset direction.
 * @param resolution - Current map resolution (map units per pixel) used to scale the offset.
 * @returns The adjusted center coordinate as `[x, y]`, or the original `position` when the map size cannot be determined.
 */
function getCenterWithHeading(
    map: ReturnType<typeof useOL>["map"],
    position: [number, number],
    rotation: number,
    resolution: number
) {
    const size = map?.getSize();
    if (!size) {
        return position;
    }

    const height = size[1];

    return [
        position[0] - (Math.sin(rotation) * height * resolution) / 4,
        position[1] + (Math.cos(rotation) * height * resolution) / 4,
    ] as [number, number];
}

/**
 * Convert a park object into a feature descriptor with a two-element coordinate tuple.
 *
 * @param park - Park object with `name` and `scaledCoords` (array containing `[x, y]`)
 * @returns An object containing `name` and `scaledCoords` as a `[number, number]` tuple
 */
function toParkFeature(park: { name: string; scaledCoords: number[] }) {
    return {
        name: park.name,
        scaledCoords: [park.scaledCoords[0], park.scaledCoords[1]] as [number, number],
    };
}

const GeolocationPositionLayer = memo(function GeolocationPositionLayer({
    position,
    accuracy,
}: {
    position: number[] | null;
    accuracy: LineString | null;
}): JSX.Element {
    useRenderDebug("GeolocationPositionLayer", {
        hasPosition: Boolean(position),
        hasAccuracy: Boolean(accuracy),
    });

    return (
        <RLayerVector zIndex={10}>
            <RStyle.RStyle>
                <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} />
                <RStyle.RStroke color={"#007bff"} width={3} />
            </RStyle.RStyle>
            {position && <RFeature geometry={new Point(position)}></RFeature>}
            {accuracy && <RFeature geometry={accuracy as LineString}></RFeature>}
        </RLayerVector>
    );
});

const GeolocationTrackingController = memo(function GeolocationTrackingController({
    debug,
    map,
}: {
    debug: boolean;
    map: ReturnType<typeof useOL>["map"];
}): JSX.Element {
    const [parkModalOpen, setParkModalOpen] = useState(false);
    const { preloadBuffers, resonanceAudioScene, stopSound } = useAudioEngine();
    const { audioContext } = useAudioContext();
    const {
        accuracy,
        debugPermission,
        onGeolocationChange,
        parkDistance,
        parkName,
        prefetchParkName,
        position,
        userOrientationEnabled,
    } = useGeolocationTracking({
        debug,
        resonanceAudioScene,
        stopSound,
    });

    const debugPosition = position ? toLonLat(position.slice(0, 2)) as [number, number] : null;
    const prefetchUrls = useMemo(() => {
        if (!prefetchParkName) {
            return null;
        }

        return pickSoundPath(prefetchParkName, stateParks, navigator.userAgent);
    }, [prefetchParkName]);

    const handleGeolocationChange = useCallback((event: { target: OLGeoLoc }) => {
        onGeolocationChange(event);
    }, [onGeolocationChange]);

    useRenderDebug("GeolocationTrackingController", {
        debug,
        parkModalOpen,
        parkName,
        prefetchParkName,
        hasPosition: Boolean(position),
        debugPermission,
        parkDistanceBucket: Math.floor(parkDistance),
    });

    useEffect(() => {
        if (!audioContext || !prefetchUrls?.length) {
            return;
        }

        void preloadBuffers(prefetchUrls);
    }, [audioContext, prefetchUrls, preloadBuffers]);

    useEffect(() => {
        setParkModalOpen(Boolean(parkName));
    }, [parkName]);

    useEffect(() => {
        const view = map?.getView();
        if (!view || !position) {
            return;
        }

        const rotation = -position[2];
        view.setCenter(getCenterWithHeading(map, [position[0], position[1]], rotation, view.getResolution() ?? 0));
        view.setRotation(rotation);
    }, [map, position]);


    return (
        <>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}
                onChange={handleGeolocationChange}
            />

            <GeolocationPositionLayer position={position} accuracy={accuracy} />

            <ErrorBoundary fallback={<div>Error</div>}>
                {parkModalOpen && (
                    <ParkModal
                        isOpen={parkModalOpen}
                        setIsOpen={setParkModalOpen}
                        parkName={parkName}
                        parkDistance={Math.floor(parkDistance)}
                        userOrientation={userOrientationEnabled}
                    />
                )}
            </ErrorBoundary>

            {debug && (
                <GeolocationDebugPanel
                    position={debugPosition}
                    parkName={parkName}
                    debugPermission={debugPermission}
                />
            )}
        </>
    );
});

/**
 * Renders geolocation overlays for the map, including park feature layers and the tracking controller.
 *
 * @param debug - If `true`, includes additional debug park features and enables debug behavior
 * @returns A React element containing park feature layers and the geolocation tracking controller
 */
function GeolocationOverlay({ debug = false }: { debug?: boolean }): JSX.Element {
    const { map } = useOL();
    const parkFeatures = useMemo(
        () => (debug ? [testPark, ...scaledPoints] : scaledPoints).map(toParkFeature),
        [debug]
    );

    useRenderDebug("GeolocationOverlay", {
        debug,
        hasMap: Boolean(map),
    });

    return (
        <div>
            <ParkFeatureLayers parkFeatures={parkFeatures} maxDistance={15} />
            <GeolocationTrackingController
                debug={debug}
                map={map}
            />
        </div>
    );
}

export default function GeolocationMap({ debug = false }: { debug?: boolean }): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false);
    const openHelp = useCallback(() => {
        setHelpIsOpen(true);
    }, []);

    useRenderDebug("GeolocationMap", {
        debug,
        helpIsOpen,
    });

    return (
        <RMap
            className="map"
            initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
        >
            <RControl.RCustom className="example-control">
                <button onClick={openHelp}>
                    ?
                </button>
            </RControl.RCustom>
            {helpIsOpen && <HelpModal isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
            <ROSM />
            <GeolocationOverlay debug={debug} />
        </RMap>
    );
}
