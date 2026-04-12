import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Geolocation as OLGeoLoc } from "ol";
import { LineString } from "ol/geom";
import { fromLonLat, toLonLat } from "ol/proj";
import type { ResonanceAudio } from "resonance-audio";

import scaledPoints, { testPark } from "../utils/scaledParks";
import { distanceInMeters } from "../utils/geo";

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

/**
 * Normalizes an angle in radians to the range [0, 2π).
 *
 * @param n - Angle in radians to normalize
 * @returns The equivalent angle in radians between 0 (inclusive) and 2π (exclusive)
 */
function mod(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * Tracks the user's geolocation over time, detects proximity to known parks, and exposes state and handlers for audio listener positioning and orientation.
 *
 * @param debug - If true, includes a test park and queries geolocation permission status for debugging.
 * @param resonanceAudioScene - Optional ResonanceAudio instance used to update the audio listener position.
 * @param stopSound - Callback invoked when the user leaves an active park to stop playback.
 *
 * @returns An object with the following properties:
 * - `accuracy`: a LineString representing the latest geolocation accuracy circle, or `null`.
 * - `debugPermission`: the current geolocation permission state string for debug purposes.
 * - `maxDistance`: the maximum distance in meters considered "inside" a park.
 * - `onGeolocationChange`: handler to consume OpenLayers geolocation events and update internal tracking.
 * - `parkDistance`: distance in meters from the user to the active park (0 when none).
 * - `parkFeatures`: array of available parks with scaled coordinates and names.
 * - `parkName`: name of the currently active park, or empty string when none.
 * - `prefetchParkName`: name of a nearby park within the prefetch threshold, or empty string when none.
 * - `position`: the most recent sampled coordinate from the internal `"XYZM"` path (projected `[x, y, heading, m]`), or `null`.
 * - `userOrientationEnabled`: `true` when orientation-based behavior is enabled (user very close to active park), otherwise `false`.
 */
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
    const [currentParkLocation, setCurrentParkLocation] = useState<Coordinate | null>(null);
    const [userOrientationEnabled, setUserOrientationEnabled] = useState(false);
    const [debugPermission, setDebugPermission] = useState("unknown");

    const deltaMeanRef = useRef(500);
    const previousMRef = useRef(0);
    const positionsRef = useRef(new LineString([], "XYZM"));

    const maxDistance = 15;
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
        let closestPark: ParkFeature | null = null;
        let closestParkDistance = Number.POSITIVE_INFINITY;

        for (const park of parkFeatures) {
            const distance = distanceInMeters(userLocation, park.scaledCoords);
            if (distance < closestParkDistance) {
                closestPark = park;
                closestParkDistance = distance;
            }
        }

        setPrefetchParkName(closestPark && closestParkDistance < prefetchDistance ? closestPark.name : "");

        const nearbyPark = parkFeatures.find((park) => distanceInMeters(userLocation, park.scaledCoords) < maxDistance);

        if (nearbyPark && nearbyPark.name !== parkName) {
            setParkName(nearbyPark.name);
            setCurrentParkLocation(nearbyPark.scaledCoords);
        }

        if (!currentParkLocation) {
            return;
        }

        const currentDistance = distanceInMeters(currentParkLocation, userLocation);
        if (currentDistance < maxDistance) {
            setParkDistance(currentDistance);
            resonanceAudioScene?.setListenerPosition(currentDistance, currentDistance, 0);
            setUserOrientationEnabled(currentDistance < 5);
        }

        if (currentDistance > maxDistance) {
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
        maxDistance,
        onGeolocationChange,
        parkDistance,
        parkFeatures,
        parkName,
        prefetchParkName,
        position,
        userOrientationEnabled,
    };
}
