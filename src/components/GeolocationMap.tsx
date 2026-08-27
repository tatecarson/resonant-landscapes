import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString, Point } from "ol/geom";
import { unByKey } from "ol/Observable";
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
import {
    useGeolocationTracking,
    GEOLOCATION_PERMISSION_DENIED,
    GEOLOCATION_TIMEOUT,
    type GeolocationFailure,
    type LocationStatus,
} from "../hooks/useGeolocationTracking";
import { useRenderDebug } from "../hooks/useRenderDebug";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import {
    CENTER_ROTATION_RADIUS_METERS,
    MAX_ZOOM,
    MIN_ZOOM,
    PROXIMITY_ZOOM,
} from "../config/geofence";
import stateParks from "../data/stateParks.json";
import { pickSoundPath } from "../utils/audioPaths";
import type { Variant, MockPosition } from "../App";
import locationIcon from "../assets/geolocation_marker_heading.svg";


function locationStatusMessage(
    status: LocationStatus,
    error: GeolocationFailure | null,
    accuracyMeters: number | null,
    enterDistance: number
): { title: string; detail: string } | null {
    if (status === "stale") {
        return {
            title: "Signal lost",
            detail: "Your position has stopped updating. Move into open sky — parks will not trigger until it does.",
        };
    }

    if (status === "imprecise") {
        // Without the number this reads as a vague apology. With it, the
        // walker can tell "drifting a little" from "useless under these trees".
        const radius = accuracyMeters === null ? null : Math.round(accuracyMeters);
        return {
            title: "GPS is imprecise here",
            detail: radius === null
                ? `Your position is less accurate than the ${enterDistance} m listening areas, so parks may trigger late or not at all.`
                : `Your position is accurate to about ${radius} m, wider than the ${enterDistance} m listening areas. Parks may trigger late, early, or not at all — open sky helps.`,
        };
    }

    if (status === "acquiring") {
        return {
            title: "Finding you…",
            detail: "Step into open sky if this takes more than a moment.",
        };
    }

    if (status !== "error") {
        return null;
    }

    if (error?.code === GEOLOCATION_PERMISSION_DENIED) {
        return {
            title: "Location is blocked",
            detail:
                "This walk follows where you are. Allow location for this site in your browser settings, then reload the page.",
        };
    }

    if (error?.code === GEOLOCATION_TIMEOUT) {
        return {
            title: "Can't find your location yet",
            detail: "This is taking longer than usual. Move away from buildings and tree cover.",
        };
    }

    return {
        title: "Can't find your location",
        detail: "Your device could not get a fix. Move into open sky, then reload the page.",
    };
}

const LocationStatusOverlay = memo(function LocationStatusOverlay({
    status,
    error,
    accuracyMeters,
    enterDistance,
}: {
    status: LocationStatus;
    error: GeolocationFailure | null;
    accuracyMeters: number | null;
    enterDistance: number;
}): JSX.Element {
    const message = locationStatusMessage(status, error, accuracyMeters, enterDistance);

    // The control stays mounted and only its contents toggle. Unmounting an
    // RCustom throws "removeChild ... is not a child of this node" from
    // rlayers, which lands in the ErrorBoundary around ParkModal and silently
    // replaces the park strip with its fallback.
    return (
        <RControl.RCustom className="location-status-control">
            {message ? (
                <div
                    className="location-status"
                    data-testid="location-status"
                    role="status"
                    aria-live="polite"
                >
                    <p className="location-status__title">{message.title}</p>
                    <p className="location-status__detail">{message.detail}</p>
                </div>
            ) : (
                <></>
            )}
        </RControl.RCustom>
    );
});

function ZoomBoundsController({
    debug = false,
    minZoom = MIN_ZOOM,
    maxZoom = MAX_ZOOM,
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
    showPositionIcon = true,
}: {
    position: number[] | null;
    accuracy: LineString | null;
    showPositionIcon?: boolean;
}): JSX.Element {
    useRenderDebug("GeolocationPositionLayer", {
        hasPosition: Boolean(position),
        hasAccuracy: Boolean(accuracy),
        showPositionIcon,
    });

    return (
        <RLayerVector zIndex={10}>
            <RStyle.RStyle>
                <RStyle.RIcon src={locationIcon} anchor={[0.5, 52 / 96]} scale={0.62} />
                <RStyle.RStroke color={"rgba(33,73,62,0.28)"} width={2} />
            </RStyle.RStyle>
            {showPositionIcon && position && <RFeature geometry={new Point(position)}></RFeature>}
            {accuracy && <RFeature geometry={accuracy as LineString}></RFeature>}
        </RLayerVector>
    );
});

const CenteredGeolocationMarker = memo(function CenteredGeolocationMarker({
    active,
}: {
    active: boolean;
}): JSX.Element {
    return (
        <RControl.RCustom
            className={`centered-geolocation-control ${active ? "centered-geolocation-control--active" : "centered-geolocation-control--hidden"}`}
        >
            <img
                src={locationIcon}
                alt=""
                aria-hidden="true"
                className="centered-geolocation-marker"
            />
        </RControl.RCustom>
    );
});

const GeolocationTrackingController = memo(function GeolocationTrackingController({
    debug,
    variant,
    mockPosition,
    map,
    helpIsOpen,
}: {
    debug: boolean;
    variant: Variant;
    mockPosition: MockPosition | null;
    map: ReturnType<typeof useOL>["map"];
    helpIsOpen: boolean;
}): JSX.Element {
    const [parkModalOpen, setParkModalOpen] = useState(false);
    const { preloadBuffers, resonanceAudioScene, stopSound } = useAudioEngine();
    const { audioContext } = useAudioContext();
    const {
        accuracy,
        accuracyMeters,
        currentParkLocation,
        debugPermission,
        enterDistance,
        exitDistance,
        onGeolocationChange,
        onGeolocationError,
        geolocationError,
        locationStatus,
        parkDistance,
        parkFeatures,
        parkName,
        prefetchParkName,
        prefetchParks,
        position,
        mapHeading,
        userOrientationEnabled,
    } = useGeolocationTracking({
        debug,
        variant,
        mockPosition,
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

    const handleGeolocationError = useCallback((event: unknown) => {
        onGeolocationError(event);
    }, [onGeolocationError]);

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
        // Audio is stopped by the tracking hook on the parkName transition
        // itself; this only follows the park with the modal.
        setParkModalOpen(Boolean(parkName));
    }, [parkName]);

    // memo()'d layers only pay off if their props are stable: both of these
    // were fresh arrays on every render, which is every GPS frame.
    const glowParks = useMemo(
        () => parkFeatures.map((p) => ({ name: p.name, coords: p.scaledCoords })),
        [parkFeatures]
    );
    const sunRayParks = useMemo(
        () => (currentParkLocation ? [{ coords: currentParkLocation, distance: parkDistance }] : []),
        [currentParkLocation, parkDistance]
    );

    const prefersReducedMotion = usePrefersReducedMotion();

    /**
     * Arriving somewhere is the event of a sound walk, and leaving is the
     * other one. Both were conveyed only by the strip appearing and
     * disappearing on screen.
     *
     * This lives here rather than in ParkModal because the modal unmounts on
     * exit — an exit announcement inside it would be removed from the DOM
     * before any screen reader could speak it. Announcing on transitions
     * rather than interpolating the live distance also stops it re-announcing
     * every single metre walked.
     */
    const [parkAnnouncement, setParkAnnouncement] = useState("");
    const announcedParkRef = useRef("");
    useEffect(() => {
        const previous = announcedParkRef.current;
        if (parkName === previous) {
            return;
        }
        announcedParkRef.current = parkName;

        if (parkName) {
            setParkAnnouncement(`Entering ${parkName}, ${Math.floor(parkDistance)} metres away`);
        } else if (previous) {
            setParkAnnouncement("Left the listening area");
        }
    }, [parkName, parkDistance]);
    // The proximity zoom is an 800 ms camera move over the whole viewport.
    // Reduced motion gets the same destination, arrived at instantly.
    const zoomDurationMs = prefersReducedMotion ? 0 : 800;

    const savedZoomRef = useRef<number | null>(null);
    const inProximityRef = useRef(false);
    const inProximity = prefetchParks.length > 0;
    const showCenteredGeolocationMarker =
        Boolean(position) &&
        userOrientationEnabled &&
        parkDistance <= CENTER_ROTATION_RADIUS_METERS;

    useEffect(() => {
        const view = map?.getView();
        if (!view || !position) {
            return;
        }

        const rotation = -mapHeading;
        view.setCenter([position[0], position[1]] as [number, number]);
        view.setRotation(rotation);

        // OpenLayers updates its coordinate-to-pixel transform during render.
        // Reading it immediately after setCenter/setRotation uses the previous
        // frame and can report a projected coordinate as a huge pixel offset.
        const renderKey = map.once("postrender", () => {
            const markerPixel = map.getPixelFromCoordinate([position[0], position[1]]) ?? null;
            const viewportSize = map.getSize() ?? null;
            window.__mapDebug = {
                center: view.getCenter() as [number, number] | null,
                position: [position[0], position[1]],
                rotation,
                centerOnUser: true,
                markerPixel: markerPixel as [number, number] | null,
                viewportSize: viewportSize as [number, number] | null,
            };
        });

        return () => unByKey(renderKey);
    }, [map, position, mapHeading]);

    useEffect(() => {
        const view = map?.getView();
        if (!view) return;

        if (inProximity && !inProximityRef.current) {
            savedZoomRef.current = view.getZoom() ?? null;
            view.animate({ zoom: PROXIMITY_ZOOM, duration: zoomDurationMs });
        } else if (!inProximity && inProximityRef.current) {
            if (savedZoomRef.current !== null) {
                view.animate({ zoom: savedZoomRef.current, duration: zoomDurationMs });
            }
        }

        inProximityRef.current = inProximity;
    }, [map, inProximity, zoomDurationMs]);


    return (
        <>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}
                onChange={handleGeolocationChange}
                onError={handleGeolocationError}
            />

            <p className="sr-only" data-testid="park-announcement" role="status" aria-live="polite">
                {parkAnnouncement}
            </p>

            <LocationStatusOverlay
                status={locationStatus}
                error={geolocationError}
                accuracyMeters={accuracyMeters}
                enterDistance={enterDistance}
            />

            <ParkGlowLayer
                parks={glowParks}
                activeParkName={parkName || undefined}
                activeParkDistance={Math.floor(parkDistance)}
            />
            <ParkFeatureLayers parkFeatures={parkFeatures} />

            <GeolocationPositionLayer
                position={position}
                accuracy={accuracy}
                showPositionIcon={!showCenteredGeolocationMarker}
            />
            <CenteredGeolocationMarker active={showCenteredGeolocationMarker} />

            <ProximityRingLayer
                parks={prefetchParks}
                active={prefetchParks.length > 0 && !parkName}
                enterDistance={enterDistance}
            />

            <SunRayLayer
                parks={sunRayParks}
                active={Boolean(parkName)}
            />

            <ErrorBoundary fallback={<div>Error</div>}>
                {parkModalOpen && (
                    <ParkModal
                        isOpen={parkModalOpen}
                        setIsOpen={setParkModalOpen}
                        parkName={parkName}
                        parkDistance={parkDistance}
                        userOrientation={userOrientationEnabled}
                        mapHeading={mapHeading}
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
    variant,
    mockPosition,
    helpIsOpen,
}: {
    debug?: boolean;
    variant: Variant;
    mockPosition: MockPosition | null;
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
                variant={variant}
                mockPosition={mockPosition}
                map={map}
                helpIsOpen={helpIsOpen}
            />
        </div>
    );
}

export default function GeolocationMap({
    debug = false,
    variant = "dsu",
    mockPosition = null,
}: {
    debug?: boolean;
    variant?: Variant;
    mockPosition?: MockPosition | null;
}): JSX.Element {
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
                variant={variant}
                mockPosition={mockPosition}
                helpIsOpen={helpIsOpen}
            />
        </RMap>
    );
}
