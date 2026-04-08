import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { fromLonLat, toLonLat } from "ol/proj";
import { Point, LineString } from "ol/geom";
import Circle from 'ol/geom/Circle';
import { Geolocation as OLGeoLoc } from "ol";
import {
    RMap,
    ROSM,
    RLayerVector,
    RFeature,
    RGeolocation,
    RStyle,
    useOL,
    RPopup,
    RControl
} from "rlayers";

import ParkModal from "./ParkModal";
import "ol/ol.css";
import './layers.css'

import { useAudioContext } from "../contexts/AudioContextProvider";
import HelpMenu from "./HelpModal";

import scaledPoints, { testPark } from "../js/scaledParks";
import { distanceInMeters } from "../js/geo";
import marker from '../assets/trees.png'
import locationIcon from "../assets/geolocation_marker_heading.png";
import { ErrorBoundary } from "react-error-boundary";

// modulo for negative values
function mod(n: number) {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function degToRad(deg: number) {
    return (deg * Math.PI) / 180;
}

function DebugPanel({
    position,
    parkName,
    debugPermission,
    audioState,
    isLoading,
    isPlaying,
    hasSourceNode,
    hasBuffers,
    bufferDuration,
    bufferChannels,
    loadError,
}: {
    position: [number, number] | null;
    parkName: string;
    debugPermission: string;
    audioState: string;
    isLoading: boolean;
    isPlaying: boolean;
    hasSourceNode: boolean;
    hasBuffers: boolean;
    bufferDuration: number | null;
    bufferChannels: number | null;
    loadError: string | null;
}) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    return (
        <div className="pointer-events-auto fixed bottom-3 left-3 z-20 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-black/10 bg-white/92 p-3 text-[11px] leading-4 text-slate-700 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="font-semibold uppercase tracking-[0.2em] text-slate-500">Audio Debug</p>
                    <p className="text-xs text-slate-900">{window.location.pathname}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCollapsed((current) => !current)}
                    className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600"
                >
                    {isCollapsed ? "Open" : "Hide"}
                </button>
            </div>

            {!isCollapsed && (
                <div className="mt-3 space-y-2">
                    <p><span className="font-semibold text-slate-900">Context:</span> {audioState}</p>
                    <p><span className="font-semibold text-slate-900">Loading:</span> {isLoading ? "yes" : "no"}</p>
                    <p><span className="font-semibold text-slate-900">Playing flag:</span> {isPlaying ? "yes" : "no"}</p>
                    <p><span className="font-semibold text-slate-900">Source node:</span> {hasSourceNode ? "present" : "missing"}</p>
                    <p><span className="font-semibold text-slate-900">Buffers:</span> {hasBuffers ? "loaded" : "empty"}</p>
                    <p><span className="font-semibold text-slate-900">Duration:</span> {bufferDuration ? `${bufferDuration.toFixed(2)} s` : "n/a"}</p>
                    <p><span className="font-semibold text-slate-900">Channels:</span> {bufferChannels ?? "n/a"}</p>
                    <p><span className="font-semibold text-slate-900">Geo permission:</span> {debugPermission}</p>
                    <p><span className="font-semibold text-slate-900">Coords:</span> {position ? `${position[1].toFixed(5)}, ${position[0].toFixed(5)}` : "waiting"}</p>
                    <p><span className="font-semibold text-slate-900">Park:</span> {parkName || "none"}</p>
                    {loadError && (
                        <div className="rounded-xl bg-rose-50 px-2 py-2 text-[10px] text-rose-700">
                            <span className="font-semibold">Load error:</span> {loadError}
                        </div>
                    )}
                    {!loadError && (
                        <div className="rounded-xl bg-slate-100 px-2 py-2 text-[10px] text-slate-600">
                            If sound fails, check whether the context is `suspended`, buffers are empty, or the source node never appears after tapping play.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function GeolocComp({ debug = false }): JSX.Element {

    const [pos, setPos] = useState<number[] | null>(fromLonLat([0, 0]));
    const [accuracy, setAccuracy] = useState<LineString | null>(null);
    const [deltaMean, setDeltaMean] = useState<number>(500);
    const [previousM, setPreviousM] = useState<number>(0);

    const [isOpen, setIsOpen] = useState(false)
    const [parkName, setParkName] = useState<string>('');
    const [parkDistance, setParkDistance] = useState<number>(0);
    const [currentParkLocation, setCurrentParkLocation] = useState<[number, number] | null>(null);
    const [enableUserOrientation, setEanbleUserOrientation] = useState(false);
    const [debugPermission, setDebugPermission] = useState("unknown");

    const {
        resonanceAudioScene,
        stopSound,
        isPlaying,
        isLoading,
        loadError,
        audioContext,
        buffers,
        bufferSourceRef,
    } = useAudioContext();

    const parkFeatures = useMemo(
        () => (debug ? [testPark, ...scaledPoints] : scaledPoints),
        [debug]
    );

    const positionsRef = useRef(new LineString([], 'XYZM'));
    const positions = positionsRef.current;

    // Low-level access to the OpenLayers API
    const { map } = useOL();

    const view = map?.getView();

    const maxDistance = 15; // meters

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

    function addPosition(position: [number, number], heading: number, m: number, speed: number) {
        if (!position) return; // Guard clause if position is not provided

        const x = position[0];
        const y = position[1];
        const fCoords = positions.getCoordinates();
        const previous = fCoords[fCoords.length - 1];
        const prevHeading = previous && previous[2];
        let newHeading = heading;
        if (prevHeading !== undefined) {
            let headingDiff = newHeading - mod(prevHeading);

            if (Math.abs(headingDiff) > Math.PI) {
                const sign = headingDiff >= 0 ? 1 : -1;
                headingDiff = -sign * (2 * Math.PI - Math.abs(headingDiff));
            }
            newHeading = prevHeading + headingDiff;
        }
        positions.appendCoordinate([x, y, newHeading, m]);

        positions.setCoordinates(positions.getCoordinates().slice(-20));
    }

    // recenters the view by putting the given coordinates at 3/4 from the top or
    // the screen
    function getCenterWithHeading(position: [number, number], rotation: number, resolution: number) {
        const size = map?.getSize();
        if (!size) return position; // Return early if map size is not available

        const height = size[1];

        return [
            position[0] - (Math.sin(rotation) * height * resolution * 1) / 4,
            position[1] + (Math.cos(rotation) * height * resolution * 1) / 4,
        ];
    }

    function updateView() {
        if (!view) return;

        // console.count('updateView() called');
        let m = Date.now() - deltaMean * 1.5;
        m = Math.max(m, previousM);
        setPreviousM(m);

        const c = positions.getCoordinateAtM(m, true);

        if (c) {
            view.setCenter(getCenterWithHeading([c[0], c[1]], -c[2], view.getResolution() ?? 0));
            view.setRotation(-c[2]);
            setPos(c);

            const userLocation = toLonLat([c[0], c[1]]) as [number, number];
            parkFeatures.forEach(park => {
                const parkLocation = park.scaledCoords as [number, number];
                const distance = distanceInMeters(userLocation, parkLocation);
                if (distance < maxDistance && !isOpen) {
                    setIsOpen(true);
                    console.count('isOpen set to true');
                    setParkName(park.name);
                    setCurrentParkLocation(parkLocation);
                }
            });

            if (!currentParkLocation) {
                return;
            }

            const currentParkDistance = distanceInMeters(currentParkLocation, userLocation);

            if (currentParkDistance < maxDistance) {
                setParkDistance(currentParkDistance);

                if (resonanceAudioScene) {
                    console.log("Setting listener position to ", currentParkDistance, currentParkDistance, 0)
                    resonanceAudioScene.setListenerPosition(currentParkDistance, currentParkDistance, 0);
                }

                // minDistance
                if (currentParkDistance < 5) {
                    console.log("User is close to ", parkName)
                    setEanbleUserOrientation(true);
                } else {
                    setEanbleUserOrientation(false);
                }
            }
            // reset if the user walks away from the park center
            if (currentParkDistance > maxDistance && isOpen) {
                setIsOpen(false);
                stopSound();
            }
        }
    }


    function createParkFeature(scaledCoords: [number, number], name: string, key: number) {
        // console.log("scaledCoords", scaledCoords, name)
        const pointGeometry = new Point(fromLonLat(scaledCoords));
        return (
            <RFeature geometry={pointGeometry} key={key}>
                <RStyle.RStyle>

                    <RStyle.RIcon src={marker} anchor={[0.5, 0.8]} />
                </RStyle.RStyle>
                <RPopup trigger={"click"} className="example-overlay">
                    {name}
                </RPopup>
            </RFeature>
        );
    }

    function createMaxDistanceFeature(scaledCoords: [number, number], name: string, key: number) {
        const circleGeometry = new Circle(fromLonLat(scaledCoords), maxDistance);
        return (
            <RFeature geometry={circleGeometry} key={key}>
                <RStyle.RStyle>
                    <RStyle.RFill color={"rgba(76, 175, 80, 0.2)"} />
                    <RStyle.RStroke color={"green"} width={2} />
                </RStyle.RStyle>
            </RFeature>
        );
    }

    const debugPosition = pos ? toLonLat(pos.slice(0, 2)) as [number, number] : null;
    const audioBuffer = buffers && 'duration' in buffers ? buffers : null;

    return (

        <div>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}

                onChange={useCallback(
                    (e: { target: OLGeoLoc; }) => {
                        const geoloc = e.target as OLGeoLoc;
                        const position = geoloc.getPosition();
                        if (position) {
                            const [x, y] = position; // Destructure the position into x and y coordinates
                            setAccuracy(new LineString([position]));
                            const m = Date.now();
                            // this line enables the geolocation feature 
                            addPosition([x, y], geoloc.getHeading() ?? 0, m, geoloc.getSpeed() ?? 0); // Pass [x, y] as the position

                            const coords = positions.getCoordinates();
                            const len = coords.length;
                            if (len >= 2) {
                                setDeltaMean((coords[len - 1][3] - coords[0][3]) / (len - 1));
                            }

                            updateView();

                        }
                    },
                    [positions, map] // Dependency array updated
                )}
            />

            <RLayerVector zIndex={10}>
                <RStyle.RStyle>
                    <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} />
                    <RStyle.RStroke color={"#007bff"} width={3} />
                </RStyle.RStyle>
                {pos && <RFeature geometry={new Point(pos)}></RFeature>}
                {accuracy && <RFeature geometry={accuracy}></RFeature>}
            </RLayerVector>

            <RLayerVector zIndex={9}>
                {parkFeatures.map((park, i) => createParkFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>

            <RLayerVector zIndex={10}>
                {parkFeatures.map((park, i) => createMaxDistanceFeature(park.scaledCoords, park.name, i))}
            </RLayerVector>
            <ErrorBoundary fallback={<div>Error</div>}>
                {isOpen && <ParkModal isOpen={isOpen} setIsOpen={setIsOpen} parkName={parkName} parkDistance={parkDistance} userOrientation={enableUserOrientation} />}
            </ErrorBoundary>
            {debug && (
                <>
                    <DebugPanel
                        position={debugPosition}
                        parkName={parkName}
                        debugPermission={debugPermission}
                        audioState={audioContext?.state ?? "unavailable"}
                        isLoading={isLoading}
                        isPlaying={isPlaying}
                        hasSourceNode={Boolean(bufferSourceRef.current)}
                        hasBuffers={Boolean(audioBuffer)}
                        bufferDuration={audioBuffer?.duration ?? null}
                        bufferChannels={audioBuffer?.numberOfChannels ?? null}
                        loadError={loadError}
                    />
                </>
            )}

        </div>

    );
}


export default function Geolocation({ debug = false }: { debug?: boolean }): JSX.Element {
    const [helpIsOpen, setHelpIsOpen] = useState(false)

    return (
        <>

            <RMap
                className="map"
                initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
            >
                <RControl.RCustom className="example-control">
                    <button onClick={() => setHelpIsOpen(true)}>
                        ?
                    </button>
                </RControl.RCustom>
                {helpIsOpen && <HelpMenu isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
                <ROSM />
                <GeolocComp debug={debug} />

            </RMap>

        </>
    );
}
