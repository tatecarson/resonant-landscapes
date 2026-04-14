import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import type { ResonanceAudio } from "resonance-audio";

import scaledPoints, { testPark } from "../utils/scaledParks";
import { distanceInMeters } from "../utils/geo";
import { findClosestPark, selectNearestInRangePark } from "../utils/parkSelection";

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
    const [currentParkLocation, setCurrentParkLocation] = useState<Coordinate | null>(null);
    const [userOrientationEnabled, setUserOrientationEnabled] = useState(false);
    const [debugPermission, setDebugPermission] = useState("unknown");

    const deltaMeanRef = useRef(500);
    const previousMRef = useRef(0);
    const positionsRef = useRef(new LineString([], "XYZM"));

    const enterDistance = 15;
    const exitDistance = 18;
    const prefetchDistance = 40;
    const parkFeatures = useMemo<ParkFeature[]>(
        () => (debug ? [testPark, ...scaledPoints] : scaledPoints).map(toParkFeature),
        [debug]
    );

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

    const updateView = useCallback(() => {
        let m = Date.now() - deltaMeanRef.current * 1.5;
        m = Math.max(m, previousMRef.current);
        previousMRef.current = m;

        const coordinates = positionsRef.current.getCoordinateAtM(m, true);
        if (!coordinates) {
            return;
        }

        setPosition(coordinates);

        const userLocation = toLonLat([coordinates[0], coordinates[1]]) as Coordinate;
        const closest = findClosestPark(userLocation, parkFeatures);
        const inPrefetchRange = Boolean(closest && closest.distance < prefetchDistance);
        setPrefetchParkName(inPrefetchRange ? closest!.park.name : "");
        setPrefetchParkCoords(inPrefetchRange ? closest!.park.scaledCoords : null);
        setPrefetchParkDistance(inPrefetchRange ? closest!.distance : 0);

        const nearbyPark = selectNearestInRangePark(userLocation, parkFeatures, enterDistance);

        if (nearbyPark && nearbyPark.name !== parkName) {
            setParkName(nearbyPark.name);
            setCurrentParkLocation(nearbyPark.scaledCoords);
        }

        if (!currentParkLocation) {
            return;
        }

        const currentDistance = distanceInMeters(currentParkLocation, userLocation);
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
    }, [currentParkLocation, parkFeatures, parkName, resonanceAudioScene, stopSound]);

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

        updateView();
    }, [updateView]);

    return {
        accuracy,
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
        position,
        userOrientationEnabled,
    };
}
