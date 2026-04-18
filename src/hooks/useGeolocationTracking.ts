import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import type { ResonanceAudio } from "resonance-audio";

import scaledPoints, { testPark } from "../utils/scaledParks";
import { distanceInMeters } from "../utils/geo";
import { findClosestPark, findParksInRange, PREFETCH_DISTANCE, selectNearestInRangePark } from "../utils/parkSelection";

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
    resonanceAudioScene: ResonanceAudio | null;
    stopSound: () => void;
}

const MIN_SMOOTHING_DELAY_MS = 120;
const MAX_SMOOTHING_DELAY_MS = 420;
const POSITION_EPSILON = 0.0001;

function mod(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

export function useGeolocationTracking({
    debug,
    resonanceAudioScene,
    stopSound,
}: UseGeolocationTrackingOptions) {
    const [position, setPosition] = useState<number[] | null>(fromLonLat([0, 0]));
    const [accuracy, setAccuracy] = useState<LineString | null>(null);
    const [parkName, setParkName] = useState("");
    const [parkDistance, setParkDistance] = useState(0);
    const [prefetchParkName, setPrefetchParkName] = useState("");
    const [prefetchParkCoords, setPrefetchParkCoords] = useState<Coordinate | null>(null);
    const [prefetchParkDistance, setPrefetchParkDistance] = useState(0);
    const [prefetchParks, setPrefetchParks] = useState<{ coords: Coordinate; distance: number }[]>([]);
    const [currentParkLocation, setCurrentParkLocation] = useState<Coordinate | null>(null);
    const [userOrientationEnabled, setUserOrientationEnabled] = useState(false);
    const [debugPermission, setDebugPermission] = useState("unknown");

    const deltaMeanRef = useRef(500);
    const previousMRef = useRef(0);
    const positionsRef = useRef(new LineString([], "XYZM"));
    const animationFrameRef = useRef<number | null>(null);
    const lastRenderedPositionRef = useRef<number[] | null>(null);

    const enterDistance = 15;
    const exitDistance = 18;
    const prefetchDistance = PREFETCH_DISTANCE;
    const parkFeatures = useMemo<ParkFeature[]>(
        () => (debug ? [testPark, ...scaledPoints] : scaledPoints).map(toParkFeature),
        [debug]
    );

    const getSmoothingDelay = useCallback(() => {
        return Math.min(
            MAX_SMOOTHING_DELAY_MS,
            Math.max(MIN_SMOOTHING_DELAY_MS, deltaMeanRef.current * 0.35)
        );
    }, []);

    useEffect(() => {
        if (!debug || !navigator.permissions?.query) {
            return;
        }

        let isMounted = true;
        let permissionStatus: PermissionStatus | null = null;

        navigator.permissions.query({ name: "geolocation" }).then((status) => {
            permissionStatus = status;
            if (!isMounted) {
                return;
            }

            setDebugPermission(status.state);
            status.onchange = () => {
                setDebugPermission(status.state);
            };
        }).catch(() => {
            setDebugPermission("unsupported");
        });

        return () => {
            isMounted = false;
            if (permissionStatus) {
                permissionStatus.onchange = null;
            }
        };
    }, [debug]);

    const updateView = useCallback((timestamp = Date.now()) => {
        let m = timestamp - getSmoothingDelay();
        m = Math.max(m, previousMRef.current);
        previousMRef.current = m;

        const coordinates = positionsRef.current.getCoordinateAtM(m, true);
        if (!coordinates) {
            return false;
        }

        const previousPosition = lastRenderedPositionRef.current;
        const positionChanged = !previousPosition || coordinates.some((value, index) => {
            return Math.abs(value - previousPosition[index]) > POSITION_EPSILON;
        });

        if (!positionChanged) {
            return false;
        }

        lastRenderedPositionRef.current = coordinates;
        setPosition(coordinates);

        const userLocation = toLonLat([coordinates[0], coordinates[1]]) as Coordinate;
        const closest = findClosestPark(userLocation, parkFeatures) as { park: ParkFeature; distance: number } | null;
        const inPrefetchRange = Boolean(closest && closest.distance < prefetchDistance);
        setPrefetchParkName(inPrefetchRange ? closest!.park.name : "");
        setPrefetchParkCoords(inPrefetchRange ? closest!.park.scaledCoords : null);
        setPrefetchParkDistance(inPrefetchRange ? closest!.distance : 0);
        setPrefetchParks(findParksInRange(userLocation, parkFeatures, prefetchDistance));

        const nearbyPark = selectNearestInRangePark(userLocation, parkFeatures, enterDistance);
        const nextParkLocation = nearbyPark?.scaledCoords ?? null;

        if (nearbyPark && nearbyPark.name !== parkName) {
            setParkName(nearbyPark.name);
            setCurrentParkLocation(nextParkLocation);
        }

        const activeParkLocation = nextParkLocation ?? currentParkLocation;
        if (!activeParkLocation) {
            return;
        }

        const currentDistance = distanceInMeters(activeParkLocation, userLocation);
        if (currentDistance < exitDistance) {
            setParkDistance(currentDistance);
            resonanceAudioScene?.setListenerPosition(currentDistance, currentDistance, 0);
            setUserOrientationEnabled(currentDistance < 5);
        }

        if (currentDistance > exitDistance) {
            setParkName("");
            setParkDistance(0);
            setCurrentParkLocation(null);
            setUserOrientationEnabled(false);
            stopSound();
        }
        return true;
    }, [currentParkLocation, exitDistance, getSmoothingDelay, parkFeatures, parkName, prefetchDistance, resonanceAudioScene, stopSound]);

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
            updateView(now);

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
    }, [getSmoothingDelay, updateView]);

    const onGeolocationChange = useCallback((event: { target: OLGeoLoc }) => {
        const geoloc = event.target as OLGeoLoc;
        const nextPosition = geoloc.getPosition();
        if (!nextPosition) {
            return;
        }

        const [x, y] = nextPosition;
        setAccuracy(new LineString([nextPosition]));

        const m = Date.now();
        const features = positionsRef.current.getCoordinates();
        const previous = features[features.length - 1];
        const prevHeading = previous && previous[2];
        let newHeading = geoloc.getHeading() ?? 0;

        if (prevHeading !== undefined) {
            let headingDiff = newHeading - mod(prevHeading);
            if (Math.abs(headingDiff) > Math.PI) {
                const sign = headingDiff >= 0 ? 1 : -1;
                headingDiff = -sign * (2 * Math.PI - Math.abs(headingDiff));
            }
            newHeading = prevHeading + headingDiff;
        }

        positionsRef.current.appendCoordinate([x, y, newHeading, m]);
        positionsRef.current.setCoordinates(positionsRef.current.getCoordinates().slice(-20));

        const coords = positionsRef.current.getCoordinates();
        const len = coords.length;
        if (len >= 2) {
            deltaMeanRef.current = (coords[len - 1][3] - coords[0][3]) / (len - 1);
        }

        updateView(m);
        startAnimationLoop();
    }, [startAnimationLoop, updateView]);

    useEffect(() => {
        return () => {
            stopAnimationLoop();
        };
    }, [stopAnimationLoop]);

    return {
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
        prefetchParkCoords,
        prefetchParkDistance,
        prefetchParks,
        position,
        userOrientationEnabled,
    };
}
