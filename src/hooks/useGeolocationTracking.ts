import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import type { ResonanceAudio } from "resonance-audio";

import { getScaledPoints, testParks } from "../utils/scaledParks";
import type { Variant, MockPosition } from "../App";
import { distanceInMeters } from "../utils/geo";
import { scanParks } from "../utils/parkSelection";
import {
    CENTER_LATCH_RADIUS_METERS,
    ENTER_DISTANCE_METERS,
    EXIT_DISTANCE_METERS,
    PREFETCH_DISTANCE_METERS,
} from "../config/geofence";

type Coordinate = [number, number];


interface ParkFeature {
    name: string;
    scaledCoords: Coordinate;
}

function toParkFeature(park: { name: string; scaledCoords: number[] }): ParkFeature {
    const [lon, lat] = park.scaledCoords;

    return {
        name: park.name,
        scaledCoords: [lon, lat],
    };
}

interface UseGeolocationTrackingOptions {
    debug: boolean;
    variant: Variant;
    mockPosition: MockPosition | null;
    resonanceAudioScene: ResonanceAudio | null;
    stopSound: () => void;
}

const MIN_SMOOTHING_DELAY_MS = 120;
const MAX_SMOOTHING_DELAY_MS = 420;
// The smoothed position is EPSG:3857 metres in [0] and [1] and a heading in
// radians in [2], so one epsilon cannot serve both. The old shared 0.0001 was
// 0.1 mm against metres, so the early-out never fired and every GPS frame
// re-rendered the whole map tree.
const POSITION_EPSILON_METERS = 0.5;
const HEADING_EPSILON_RADIANS = 0.01; // ~0.6 degrees
const GPS_HEADING_ENTER_MPS = 1.2;
const GPS_HEADING_EXIT_MPS = 0.6;
const GPS_SPEED_FRESHNESS_MS = 3000;

/** W3C GeolocationPositionError codes, as reported through OpenLayers. */
export const GEOLOCATION_PERMISSION_DENIED = 1;
export const GEOLOCATION_POSITION_UNAVAILABLE = 2;
export const GEOLOCATION_TIMEOUT = 3;

export type GeolocationFailure = {
    code: number;
    message: string;
};

export type LocationStatus =
    | "acquiring"
    | "tracking"
    | "imprecise"
    | "stale"
    | "error";

/**
 * How long to wait for a first fix before telling the walker something is
 * wrong. This backstop matters more than the error event: a watch that simply
 * never calls back — the common outdoor case, and what happens when rlayers'
 * error plumbing drops the event under StrictMode remounts — produces no error
 * at all, only silence.
 */
const ACQUIRING_TIMEOUT_MS = 12_000;
// Under tree cover a phone can report a fix that is minutes old without ever
// erroring, so a fix that has stopped arriving is reported separately from one
// that never arrived.
const STALE_FIX_MS = 10_000;
const STALE_FIX_POLL_MS = 1_000;

function mod(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function shortestRadianDelta(from: number, to: number) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
}

export function useGeolocationTracking({
    debug,
    variant,
    mockPosition,
    resonanceAudioScene,
    stopSound,
}: UseGeolocationTrackingOptions) {
    // Null until the first fix arrives. Seeding a coordinate here used to put
    // the walker at Null Island, so a slow or failed fix rendered an empty
    // ocean with nothing to explain it.
    const [position, setPosition] = useState<number[] | null>(null);
    const [geolocationError, setGeolocationError] = useState<GeolocationFailure | null>(null);
    const [accuracy, setAccuracy] = useState<LineString | null>(null);
    const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
    const [isFixStale, setIsFixStale] = useState(false);
    const lastFixAtRef = useRef<number | null>(null);
    const [parkName, setParkName] = useState("");
    const [parkDistance, setParkDistance] = useState(0);
    const [prefetchParkName, setPrefetchParkName] = useState("");
    const [prefetchParks, setPrefetchParks] = useState<{ coords: Coordinate; distance: number }[]>([]);
    const [currentParkLocation, setCurrentParkLocation] = useState<Coordinate | null>(null);
    const [userOrientationEnabled, setUserOrientationEnabled] = useState(false);
    const [debugPermission, setDebugPermission] = useState("unknown");

    const deltaMeanRef = useRef(500);
    const previousMRef = useRef(0);
    const positionsRef = useRef(new LineString([], "XYZM"));
    const animationFrameRef = useRef<number | null>(null);
    const lastRenderedPositionRef = useRef<number[] | null>(null);
    const compassHeadingRef = useRef<number | null>(null);
    const lastGpsSpeedRef = useRef(0);
    const lastGpsSpeedAtRef = useRef(0);
    const usingGpsHeadingRef = useRef(false);
    const hasAbsoluteEventRef = useRef(false);
    const mapHeadingRef = useRef(0);
    const compassRafRef = useRef<number | null>(null);
    const userOrientationEnabledRef = useRef(false);
    const [mapHeading, setMapHeading] = useState(0);

    const parkFeatures = useMemo<ParkFeature[]>(
        () => {
            const pts = getScaledPoints(variant);
            return (debug ? [...testParks, ...pts] : pts).map(toParkFeature);
        },
        [debug, variant]
    );

    const getSmoothingDelay = useCallback(() => {
        return Math.min(
            MAX_SMOOTHING_DELAY_MS,
            Math.max(MIN_SMOOTHING_DELAY_MS, deltaMeanRef.current * 0.35)
        );
    }, []);

    const onGeolocationError = useCallback((event: unknown) => {
        // OpenLayers forwards the W3C error as the event itself; be defensive
        // about the shape rather than trusting a cast.
        const failure = event as Partial<GeolocationFailure> | null;
        setGeolocationError({
            code: typeof failure?.code === "number" ? failure.code : GEOLOCATION_POSITION_UNAVAILABLE,
            message: typeof failure?.message === "string" ? failure.message : "Geolocation failed.",
        });
    }, []);

    useEffect(() => {
        // Runs in production too: a denied permission is the single most
        // common reason the walk never starts, and it is worth naming.
        if (!navigator.permissions?.query) {
            return;
        }

        let isMounted = true;
        let permissionStatus: PermissionStatus | null = null;

        navigator.permissions.query({ name: "geolocation" }).then((status) => {
            permissionStatus = status;
            if (!isMounted) {
                return;
            }

            const applyPermission = () => {
                setDebugPermission(status.state);
                // A denied permission is reported reliably here even when the
                // geolocation error event never arrives.
                if (status.state === "denied") {
                    setGeolocationError({
                        code: GEOLOCATION_PERMISSION_DENIED,
                        message: "Geolocation permission denied.",
                    });
                }
            };

            applyPermission();
            status.onchange = applyPermission;
        }).catch(() => {
            setDebugPermission("unsupported");
        });

        return () => {
            isMounted = false;
            if (permissionStatus) {
                permissionStatus.onchange = null;
            }
        };
    }, []);

    // A watch that stops calling back does not error, so nothing else notices.
    // Polling a timestamp is enough: the walker needs to know the blue dot has
    // stopped meaning anything, not the exact moment it happened.
    useEffect(() => {
        if (!position) {
            return;
        }

        const timer = window.setInterval(() => {
            const lastFixAt = lastFixAtRef.current;
            if (lastFixAt === null) {
                return;
            }
            setIsFixStale(Date.now() - lastFixAt > STALE_FIX_MS);
        }, STALE_FIX_POLL_MS);

        return () => window.clearInterval(timer);
    }, [position]);

    // Backstop for a watch that never calls back at all.
    useEffect(() => {
        if (position || geolocationError) {
            return;
        }

        const timer = window.setTimeout(() => {
            setGeolocationError((current) => current ?? {
                code: GEOLOCATION_TIMEOUT,
                message: "Timed out waiting for a position fix.",
            });
        }, ACQUIRING_TIMEOUT_MS);

        return () => window.clearTimeout(timer);
    }, [position, geolocationError]);

    /** Returns whether this tick committed a new position. */
    const updateView = useCallback((timestamp = Date.now()): boolean => {
        let m = timestamp - getSmoothingDelay();
        m = Math.max(m, previousMRef.current);
        previousMRef.current = m;

        const coordinates = positionsRef.current.getCoordinateAtM(m, true);
        if (!coordinates) {
            return false;
        }

        const previousPosition = lastRenderedPositionRef.current;
        const positionChanged =
            !previousPosition ||
            Math.abs(coordinates[0] - previousPosition[0]) > POSITION_EPSILON_METERS ||
            Math.abs(coordinates[1] - previousPosition[1]) > POSITION_EPSILON_METERS ||
            Math.abs(coordinates[2] - previousPosition[2]) > HEADING_EPSILON_RADIANS;

        if (!positionChanged) {
            return false;
        }

        lastRenderedPositionRef.current = coordinates;
        setPosition(coordinates);

        const userLocation = toLonLat([coordinates[0], coordinates[1]]) as Coordinate;
        // One pass for all three answers: this runs on every GPS frame.
        // No cast: scanParks is generic over the park type, so closest.park is
        // a ParkFeature here rather than something to assert about.
        const scan = scanParks(userLocation, parkFeatures, {
            prefetchDistance: PREFETCH_DISTANCE_METERS,
            enterDistance: ENTER_DISTANCE_METERS,
        });
        const closest = scan.closest;
        const inPrefetchRange = Boolean(closest && closest.distance < PREFETCH_DISTANCE_METERS);
        setPrefetchParkName(inPrefetchRange && closest ? closest.park.name : "");
        setPrefetchParks(scan.inPrefetchRange);

        const nearbyPark = scan.nearestInEnterRange;
        const nextParkLocation = nearbyPark?.scaledCoords ?? null;

        if (nearbyPark && nearbyPark.name !== parkName) {
            // Park-to-park without passing through the exit branch. On the
            // scaled debug map the parks sit metres apart, so this is a normal
            // walk, not an edge case — and the outgoing park's audio has to
            // stop before the incoming one loads.
            if (parkName) {
                stopSound();
            }
            setParkName(nearbyPark.name);
            setCurrentParkLocation(nextParkLocation);
        }

        const activeParkLocation = nextParkLocation ?? currentParkLocation;
        if (!activeParkLocation) {
            // No active park, so there is no exit distance to check — but the
            // position itself was committed above.
            return true;
        }

        const currentDistance = distanceInMeters(activeParkLocation, userLocation);
        if (currentDistance <= EXIT_DISTANCE_METERS) {
            setParkDistance(currentDistance);
            resonanceAudioScene?.setListenerPosition(currentDistance, currentDistance, 0);
            // Keep center-mode latched while the user remains in the active park so
            // minor GPS drift does not drop map centering after rotation has started.
            const nextUserOrientationEnabled =
                currentDistance < CENTER_LATCH_RADIUS_METERS ||
                (userOrientationEnabledRef.current && currentDistance <= EXIT_DISTANCE_METERS);

            if (userOrientationEnabledRef.current !== nextUserOrientationEnabled) {
                userOrientationEnabledRef.current = nextUserOrientationEnabled;
                setUserOrientationEnabled(nextUserOrientationEnabled);
            }
        }

        if (currentDistance > EXIT_DISTANCE_METERS) {
            // The one place audio stops on leaving. GeolocationMap and
            // HoaRenderer used to duplicate this from their own lifecycles.
            setParkName("");
            setParkDistance(0);
            setCurrentParkLocation(null);
            userOrientationEnabledRef.current = false;
            setUserOrientationEnabled(false);
            stopSound();
        }
        return true;
    }, [currentParkLocation, getSmoothingDelay, parkFeatures, parkName, resonanceAudioScene, stopSound]);

    // The running tick captures updateView by closure, but updateView is
    // rebuilt whenever parkName or currentParkLocation changes — exactly when
    // the walker enters or leaves a park. The animationFrameRef guard below
    // then stops a fresh loop from starting while the stale one is still
    // alive, so entry/exit decisions would run against the previous park.
    // Reading through a ref keeps one loop calling the current logic.
    const updateViewRef = useRef(updateView);
    useEffect(() => {
        updateViewRef.current = updateView;
    }, [updateView]);

    const stopAnimationLoop = useCallback(() => {
        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    const startAnimationLoop = useCallback(() => {
        if (animationFrameRef.current !== null) {
            return;
        }

        const tick = () => {
            const now = Date.now();
            updateViewRef.current(now);

            const coords = positionsRef.current.getCoordinates();
            const latestFixM = coords[coords.length - 1]?.[3] ?? 0;
            const shouldContinue = latestFixM > 0 && now - latestFixM < getSmoothingDelay() + 200;

            if (!shouldContinue) {
                animationFrameRef.current = null;
                return;
            }

            animationFrameRef.current = requestAnimationFrame(tick);
        };

        animationFrameRef.current = requestAnimationFrame(tick);
    }, [getSmoothingDelay]);

    const commitMapHeading = useCallback((radians: number) => {
        const prev = mapHeadingRef.current;
        const next = prev + shortestRadianDelta(prev, radians);
        mapHeadingRef.current = next;
        setMapHeading(next);
    }, []);

    const isCompassHeadingActive = useCallback(() => {
        const age = Date.now() - lastGpsSpeedAtRef.current;
        if (age > GPS_SPEED_FRESHNESS_MS) {
            return true;
        }
        return !usingGpsHeadingRef.current;
    }, []);

    useEffect(() => {
        const handler = (event: DeviceOrientationEvent, isAbsoluteEvent: boolean) => {
            const compassEvent = event as DeviceOrientationEvent & {
                webkitCompassHeading?: number;
            };
            const hasIosCompass = typeof compassEvent.webkitCompassHeading === "number";

            if (isAbsoluteEvent) {
                hasAbsoluteEventRef.current = true;
            }

            let degrees: number | null = null;
            if (hasIosCompass) {
                degrees = compassEvent.webkitCompassHeading as number;
            } else if (typeof event.alpha === "number") {
                const absoluteOk = event.absolute === true || isAbsoluteEvent;
                if (hasAbsoluteEventRef.current && !absoluteOk) {
                    return;
                }
                degrees = (360 - event.alpha) % 360;
            }
            if (degrees === null || Number.isNaN(degrees)) {
                return;
            }
            const radians = (degrees * Math.PI) / 180;
            compassHeadingRef.current = radians;

            if (!isCompassHeadingActive()) {
                return;
            }

            if (compassRafRef.current !== null) {
                return;
            }
            compassRafRef.current = requestAnimationFrame(() => {
                compassRafRef.current = null;
                const latest = compassHeadingRef.current;
                if (latest === null) return;
                if (!isCompassHeadingActive()) return;
                commitMapHeading(latest);
            });
        };

        const relativeListener = (event: DeviceOrientationEvent) => handler(event, false);
        const absoluteListener = (event: Event) => handler(event as DeviceOrientationEvent, true);

        window.addEventListener("deviceorientation", relativeListener);
        window.addEventListener("deviceorientationabsolute", absoluteListener);

        return () => {
            window.removeEventListener("deviceorientation", relativeListener);
            window.removeEventListener("deviceorientationabsolute", absoluteListener);
            if (compassRafRef.current !== null) {
                cancelAnimationFrame(compassRafRef.current);
                compassRafRef.current = null;
            }
        };
    }, [commitMapHeading, isCompassHeadingActive]);

    const onGeolocationChange = useCallback((event: { target: OLGeoLoc }) => {
        const geoloc = event.target as OLGeoLoc;
        const nextPosition = geoloc.getPosition();
        if (!nextPosition) {
            return;
        }

        // A fix arrived, so any earlier failure no longer describes reality.
        // Passing null when already null is a no-op re-render-wise.
        setGeolocationError(null);

        const [x, y] = nextPosition;
        setAccuracy(new LineString([nextPosition]));

        // Accuracy is a radius in metres. Compared against the 15 m enter
        // distance it is the difference between "you are at the park" and
        // "you are somewhere in a circle that happens to contain it".
        const reportedAccuracy = geoloc.getAccuracy();
        setAccuracyMeters(typeof reportedAccuracy === "number" ? reportedAccuracy : null);
        lastFixAtRef.current = Date.now();
        setIsFixStale(false);

        const m = Date.now();
        const features = positionsRef.current.getCoordinates();
        const previous = features[features.length - 1];
        const prevHeading = previous && previous[2];
        const gpsHeading = geoloc.getHeading();
        const speed = geoloc.getSpeed() ?? 0;
        lastGpsSpeedRef.current = speed;
        lastGpsSpeedAtRef.current = m;

        if (usingGpsHeadingRef.current) {
            if (speed < GPS_HEADING_EXIT_MPS || gpsHeading === undefined) {
                usingGpsHeadingRef.current = false;
            }
        } else if (speed >= GPS_HEADING_ENTER_MPS && gpsHeading !== undefined) {
            usingGpsHeadingRef.current = true;
        }

        const rawHeading = usingGpsHeadingRef.current
            ? (gpsHeading as number)
            : compassHeadingRef.current ?? gpsHeading ?? 0;

        let newHeading = rawHeading;
        if (prevHeading !== undefined) {
            let headingDiff = newHeading - mod(prevHeading);
            if (Math.abs(headingDiff) > Math.PI) {
                const sign = headingDiff >= 0 ? 1 : -1;
                headingDiff = -sign * (2 * Math.PI - Math.abs(headingDiff));
            }
            newHeading = prevHeading + headingDiff;
        }

        commitMapHeading(rawHeading);

        positionsRef.current.appendCoordinate([x, y, newHeading, m]);
        positionsRef.current.setCoordinates(positionsRef.current.getCoordinates().slice(-20));

        const coords = positionsRef.current.getCoordinates();
        const len = coords.length;
        if (len >= 2) {
            deltaMeanRef.current = (coords[len - 1][3] - coords[0][3]) / (len - 1);
        }

        updateView(m);
        startAnimationLoop();
    }, [commitMapHeading, startAnimationLoop, updateView]);

    useEffect(() => {
        return () => {
            stopAnimationLoop();
        };
    }, [stopAnimationLoop]);

    // Dev shim: when ?mock=lat,lon is in the URL, synthesize a single
    // OLGeoLoc-shaped event so the rest of the pipeline runs without a real
    // GPS fix (useful in iframes / preview panes where geolocation is blocked).
    useEffect(() => {
        if (!mockPosition) return;
        const projected = fromLonLat(mockPosition);
        const stub = {
            getPosition: () => projected,
            getAccuracy: () => 5,
            getHeading: () => undefined,
            getSpeed: () => 0,
        };
        onGeolocationChange({ target: stub as unknown as OLGeoLoc });
    }, [mockPosition, onGeolocationChange]);

    // An error only matters while there is nothing to show. Once a fix has
    // landed the walk continues on the last known position rather than
    // throwing up a banner over a working map.
    const locationStatus: LocationStatus = !position
        ? (geolocationError ? "error" : "acquiring")
        : isFixStale
            ? "stale"
            : accuracyMeters !== null && accuracyMeters > ENTER_DISTANCE_METERS
                ? "imprecise"
                : "tracking";

    return {
        accuracy,
        accuracyMeters,
        currentParkLocation,
        debugPermission,
        geolocationError,
        locationStatus,
        onGeolocationError,
        enterDistance: ENTER_DISTANCE_METERS,
        exitDistance: EXIT_DISTANCE_METERS,
        onGeolocationChange,
        parkDistance,
        parkFeatures,
        parkName,
        prefetchParkName,
        prefetchParks,
        position,
        mapHeading,
        userOrientationEnabled,
    };
}
