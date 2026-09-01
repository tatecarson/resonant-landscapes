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
import { useReduceVisuals } from "../hooks/useReduceVisuals";
import { getVariantCenter } from "../utils/scaledParks";
import { debugLog, isDebugEnabled } from "../config/debug";
import {
    CENTER_ROTATION_RADIUS_METERS,
    MAX_ZOOM,
    MIN_ZOOM,
    RESTING_ZOOM,
} from "../config/geofence";
import stateParks from "../data/stateParks.json";
import { pickSoundPath } from "../utils/audioPaths";
import { RECOVERY_TITLES, RECOVERY_STAKES, getRecoverySteps } from "../utils/recoverySteps";
import { app, location as locationCopy, map as mapCopy } from "../copy";
import type { Variant, MockPosition } from "../App";
import locationIcon from "../assets/geolocation_marker_heading.svg";


function locationStatusMessage(
    status: LocationStatus,
    error: GeolocationFailure | null,
    accuracyMeters: number | null,
    enterDistance: number
): { title: string; detail: string; steps?: readonly string[] } | null {
    if (status === "stale") {
        return locationCopy.stale;
    }

    if (status === "imprecise") {
        const radius = accuracyMeters === null ? null : Math.round(accuracyMeters);
        return {
            title: locationCopy.imprecise.title,
            detail: locationCopy.imprecise.detail(radius, enterDistance),
        };
    }

    if (status === "acquiring") {
        return locationCopy.acquiring;
    }

    if (status !== "error") {
        return null;
    }

    if (error?.code === GEOLOCATION_PERMISSION_DENIED) {
        // The only status here the walker can actually fix, so it is the only
        // one that gets steps. "Allow location in your browser settings" was a
        // restatement of the problem, read by someone already standing outside.
        return {
            title: RECOVERY_TITLES.location,
            detail: RECOVERY_STAKES.location,
            steps: getRecoverySteps("location", navigator.userAgent),
        };
    }

    if (error?.code === GEOLOCATION_TIMEOUT) {
        return locationCopy.timeout;
    }

    return locationCopy.failed;
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
                    {message.steps && (
                        <ol className="location-status__steps">
                            {message.steps.map((step, index) => (
                                <li key={step}>
                                    <span aria-hidden="true">{index + 1}</span>
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ol>
                    )}
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

        if (isDebugEnabled()) {
            // What the view will actually honour, which is not what was just
            // set: OpenLayers derives the ceiling as minZoom plus the floored
            // log2 span, so a fractional minZoom loses the fraction.
            window.__mapZoomBounds = {
                minZoom: view.getMinZoom(),
                maxZoom: view.getMaxZoom(),
            };
        }

        const enforceZoomBounds = () => {
            const zoom = view.getZoom();

            if (zoom !== undefined && zoom < minZoom) {
                view.setZoom(minZoom);
                if (debug) {
                    debugLog("[map zoom]", minZoom, "(clamped)");
                }
                return;
            }

            if (zoom !== undefined && zoom > maxZoom) {
                view.setZoom(maxZoom);
                if (debug) {
                    debugLog("[map zoom]", maxZoom, "(clamped)");
                }
                return;
            }

            if (debug) {
                debugLog("[map zoom]", zoom);
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

    const prefersReducedMotion = useReduceVisuals();

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
    // Debug-only mirror of the view's live zoom, written every frame rather
    // than once per position like __mapDebug. It is the instrument that showed
    // the old approach zoom was being cancelled, and it now guards the promise
    // that the scale never changes on its own. See map-camera.spec.ts.
    useEffect(() => {
        if (!map || !isDebugEnabled()) {
            return;
        }
        const key = map.on("postrender", () => {
            window.__mapZoom = map.getView().getZoom() ?? null;
        });
        return () => unByKey(key);
    }, [map]);

    /**
     * The map follows the walker until they drag or pinch it, and then stops
     * until they ask for it back.
     *
     * It used to call setCenter on every position fix with nothing able to
     * interrupt it, so a pan snapped back within a second and the map could
     * not be used to look anywhere but at your own feet. Every comparable
     * piece allows this: 37 of the 38 locative audio tours surveyed by Roth et
     * al. (LBS 2023) support pan, and 38 of 38 support zoom.
     */
    const [followSuspended, setFollowSuspended] = useState(false);

    useEffect(() => {
        if (!map) {
            return;
        }

        const suspend = () => setFollowSuspended(true);
        const dragKey = map.on("pointerdrag", suspend);
        // Wheel and pinch never reach pointerdrag; both arrive here.
        const viewport = map.getViewport();
        viewport.addEventListener("wheel", suspend, { passive: true });

        return () => {
            unByKey(dragKey);
            viewport.removeEventListener("wheel", suspend);
        };
    }, [map]);

    const recenter = useCallback(() => {
        const view = map?.getView();
        if (!view || !position) {
            return;
        }

        setFollowSuspended(false);
        view.animate({
            center: [position[0], position[1]] as [number, number],
            zoom: RESTING_ZOOM,
            // Reduced motion gets the same destination, arrived at instantly.
            duration: prefersReducedMotion ? 0 : 400,
        });
    }, [map, position, prefersReducedMotion]);

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
        if (!followSuspended) {
            view.setCenter([position[0], position[1]] as [number, number]);
            view.setRotation(rotation);
        }

        // OpenLayers updates its coordinate-to-pixel transform during render.
        // Reading it immediately after setCenter/setRotation uses the previous
        // frame and can report a projected coordinate as a huge pixel offset.
        const renderKey = map.once("postrender", () => {
            const markerPixel = map.getPixelFromCoordinate([position[0], position[1]]) ?? null;
            const viewportSize = map.getSize() ?? null;
            if (!isDebugEnabled()) {
                return;
            }
            window.__mapDebug = {
                center: view.getCenter() as [number, number] | null,
                position: [position[0], position[1]],
                rotation,
                centerOnUser: !followSuspended,
                markerPixel: markerPixel as [number, number] | null,
                viewportSize: viewportSize as [number, number] | null,
            };
        });

        return () => unByKey(renderKey);
    }, [map, position, mapHeading, followSuspended]);


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

            {/*
              * Always mounted, hidden with CSS rather than by unmounting.
              * Conditionally rendering an RCustom makes rlayers throw
              * "removeChild ... is not a child of this node", which is the same
              * crash described at the top of this file.
              */}
            <RControl.RCustom className="recenter-control">
                <button
                    type="button"
                    onClick={recenter}
                    className="recenter-button"
                    data-testid="recenter"
                    aria-label={mapCopy.recenterAriaLabel}
                    aria-hidden={!followSuspended}
                    tabIndex={followSuspended ? 0 : -1}
                    data-visible={followSuspended ? "true" : "false"}
                >
                    {mapCopy.recenter}
                </button>
            </RControl.RCustom>

            {/*
              * Not the full-screen fallback: this boundary sits over the map,
              * and covering it would take away the one thing still working.
              * A bare "Error" used to render here.
              */}
            <ErrorBoundary
                // The fallback tells the walker to walk away and come back,
                // and without this it would be a lie: the boundary holds its
                // fallback until something resets it, so leaving the park and
                // returning would show the same message forever. parkName is
                // what changes on that walk.
                resetKeys={[parkName]}
                fallback={
                    <div className="location-status" role="status" data-testid="park-panel-fallback">
                        <p className="location-status__detail">{app.parkPanelCrashed}</p>
                    </div>
                }
            >
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
            initial={{ center: fromLonLat(getVariantCenter(variant)), zoom: RESTING_ZOOM }}
        >
            {/*
              * The constants, not copies of them. These were written out as
              * literals here, so the bounds and the config could drift apart
              * silently.
              */}
            <ZoomBoundsController debug={debug} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
            <RControl.RCustom className="example-control">
                <button
                    type="button"
                    onClick={openHelp}
                    className="map-help-button"
                    title={mapCopy.helpButtonLabel}
                    aria-label={mapCopy.helpButtonLabel}
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
