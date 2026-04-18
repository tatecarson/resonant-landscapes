import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString, Point } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import {
    RControl,
    RFeature,
    RGeolocation,
    RLayerTile,
    RLayerVector,
    RMap,
    RStyle,
    useOL,
} from "rlayers";
import { ErrorBoundary } from "react-error-boundary";

import "ol/ol.css";
import "./layers.css";

import HelpModal from "./HelpModal";
import ParkModal from "./ParkModal";
import ParkFeatureLayers from "./ParkFeatureLayers";
import ProximityRingLayer from "./ProximityRingLayer";
import SunRayLayer from "./SunRayLayer";
import ParkGlowLayer from "./ParkGlowLayer";
import GeolocationDebugPanel from "./GeolocationDebugPanel";
import { useAudioContext, useAudioEngine } from "../contexts/AudioContextProvider";
import { useGeolocationTracking } from "../hooks/useGeolocationTracking";
import { useRenderDebug } from "../hooks/useRenderDebug";
import stateParks from "../data/stateParks.json";
import { pickSoundPath } from "../utils/audioPaths";
import { distanceInMeters } from "../utils/geo";
import locationIcon from "../assets/geolocation_marker_heading.svg";

const RECENTER_DEAD_ZONE_METERS = 1.75;

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

function ZoomBoundsController({
    debug = false,
    minZoom = 16.72582728647343,
    maxZoom = 19.9999999,
}: {
    debug?: boolean;
    minZoom?: number;
    maxZoom?: number;
}): JSX.Element | null {
    const { map } = useOL();

    useEffect(() => {
        if (!map) {
            return;
        }

        const view = map.getView();
        view.setMinZoom(minZoom);
        view.setMaxZoom(maxZoom);

        const enforceZoomBounds = () => {
            const zoom = view.getZoom();

            if (zoom !== undefined && zoom < minZoom) {
                view.setZoom(minZoom);
                if (debug) {
                    console.log("[map zoom]", minZoom, "(clamped)");
                }
                return;
            }

            if (zoom !== undefined && zoom > maxZoom) {
                view.setZoom(maxZoom);
                if (debug) {
                    console.log("[map zoom]", maxZoom, "(clamped)");
                }
                return;
            }

            if (debug) {
                console.log("[map zoom]", zoom);
            }
        };

        enforceZoomBounds();
        view.on("change:resolution", enforceZoomBounds);

        return () => {
            view.un("change:resolution", enforceZoomBounds);
        };
    }, [debug, map, minZoom, maxZoom]);

    return null;
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
                <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} scale={0.62} />
                <RStyle.RStroke color={"rgba(33,73,62,0.28)"} width={2} />
            </RStyle.RStyle>
            {position && <RFeature geometry={new Point(position)}></RFeature>}
            {accuracy && <RFeature geometry={accuracy as LineString}></RFeature>}
        </RLayerVector>
    );
});

const GeolocationTrackingController = memo(function GeolocationTrackingController({
    debug,
    map,
    helpIsOpen,
}: {
    debug: boolean;
    map: ReturnType<typeof useOL>["map"];
    helpIsOpen: boolean;
}): JSX.Element {
    const [parkModalOpen, setParkModalOpen] = useState(false);
    const { preloadBuffers, resonanceAudioScene, stopSound } = useAudioEngine();
    const { audioContext } = useAudioContext();
    const {
        accuracy,
        currentParkLocation,
        debugPermission,
        enterDistance,
        exitDistance,
        onGeolocationChange,
        parkDistance,
        parkFeatures,
        parkName,
        prefetchParkName,
        prefetchParks,
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
        enterDistance,
        exitDistance,
        parkDistanceBucket: Math.floor(parkDistance),
    });

    useEffect(() => {
        if (!audioContext || !prefetchUrls?.length) {
            return;
        }

        void preloadBuffers(prefetchUrls);
    }, [audioContext, prefetchUrls, preloadBuffers]);

    useEffect(() => {
        // Stop sound when user walks out of range — HOARenderer no longer stops
        // on unmount so we need to handle the "left the park" case here.
        if (!parkName) {
            stopSound();
        }
        setParkModalOpen(Boolean(parkName));
    }, [parkName, stopSound]);

    const savedZoomRef = useRef<number | null>(null);
    const inProximityRef = useRef(false);
    const lastCenteredPositionRef = useRef<[number, number] | null>(null);
    const inProximity = prefetchParks.length > 0;

    useEffect(() => {
        const view = map?.getView();
        if (!view || !position) {
            return;
        }

        const currentLonLat = toLonLat([position[0], position[1]]) as [number, number];
        const rotation = -position[2];
        const lastCenteredPosition = lastCenteredPositionRef.current;
        const shouldRecenter = !lastCenteredPosition || distanceInMeters(lastCenteredPosition, currentLonLat) >= RECENTER_DEAD_ZONE_METERS;

        if (shouldRecenter) {
            view.setCenter(getCenterWithHeading(map, [position[0], position[1]], rotation, view.getResolution() ?? 0));
            lastCenteredPositionRef.current = currentLonLat;
        }

        view.setRotation(rotation);
    }, [map, position]);

    useEffect(() => {
        const view = map?.getView();
        if (!view) return;

        if (inProximity && !inProximityRef.current) {
            savedZoomRef.current = view.getZoom() ?? null;
            view.animate({ zoom: 19, duration: 800 });
        } else if (!inProximity && inProximityRef.current) {
            if (savedZoomRef.current !== null) {
                view.animate({ zoom: savedZoomRef.current, duration: 800 });
            }
        }

        inProximityRef.current = inProximity;
    }, [map, inProximity]);


    return (
        <>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}
                onChange={handleGeolocationChange}
            />

            <ParkGlowLayer
                parks={parkFeatures.map(p => ({ name: p.name, coords: p.scaledCoords }))}
                activeParkName={parkName || undefined}
                activeParkDistance={Math.floor(parkDistance)}
            />
            <ParkFeatureLayers parkFeatures={parkFeatures} />

            <GeolocationPositionLayer position={position} accuracy={accuracy} />

            <ProximityRingLayer
                parks={prefetchParks}
                active={prefetchParks.length > 0 && !parkName}
                enterDistance={enterDistance}
            />

            <SunRayLayer
                parks={currentParkLocation ? [{ coords: currentParkLocation, distance: parkDistance }] : []}
                active={Boolean(parkName)}
            />

            <ErrorBoundary fallback={<div>Error</div>}>
                {parkModalOpen && (
                    <ParkModal
                        isOpen={parkModalOpen}
                        setIsOpen={setParkModalOpen}
                        parkName={parkName}
                        parkDistance={Math.floor(parkDistance)}
                        userOrientation={userOrientationEnabled}
                        compact={true}
                        suppressed={helpIsOpen}
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

function GeolocationOverlay({
    debug = false,
    helpIsOpen,
}: {
    debug?: boolean;
    helpIsOpen: boolean;
}): JSX.Element {
    const { map } = useOL();

    useRenderDebug("GeolocationOverlay", {
        debug,
        hasMap: Boolean(map),
    });

    return (
        <div>
            <GeolocationTrackingController
                debug={debug}
                map={map}
                helpIsOpen={helpIsOpen}
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
            initial={{ center: fromLonLat([0, 0]), zoom: 19.9999999 }}
        >
            <ZoomBoundsController
                debug={debug}
                minZoom={16.72582728647343}
                maxZoom={19.9999999}
            />
            <RControl.RCustom className="example-control">
                <button
                    type="button"
                    onClick={openHelp}
                    className="map-help-button"
                    title="Open field guide"
                    aria-label="Open field guide"
                >
                    <span className="map-help-button__glyph" aria-hidden="true">?</span>
                </button>
            </RControl.RCustom>
            {helpIsOpen && <HelpModal isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
            <RLayerTile
                url="https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png"
                maxZoom={20}
                attributions='Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>.'
            />
            <GeolocationOverlay
                debug={debug}
                helpIsOpen={helpIsOpen}
            />
        </RMap>
    );
}
