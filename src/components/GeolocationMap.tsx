import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAudioEngine, useAudioPlaybackState } from "../contexts/AudioContextProvider";
import { useGeolocationTracking } from "../hooks/useGeolocationTracking";
import { useRenderDebug } from "../hooks/useRenderDebug";
import stateParks from "../data/stateParks.json";
import { pickSoundPath } from "../utils/audioPaths";
import locationIcon from "../assets/geolocation_marker_heading.png";

function GeolocationOverlay({ debug = false }: { debug?: boolean }): JSX.Element {
    const {
        resonanceAudioScene,
        stopSound,
        preloadBuffers,
        audioContext,
        bufferSourceRef,
    } = useAudioEngine();
    const {
        isPlaying,
        isLoading,
        loadError,
        buffers,
    } = useAudioPlaybackState();
    const { map } = useOL();
    const {
        accuracy,
        debugPermission,
        maxDistance,
        onGeolocationChange,
        parkDistance,
        parkFeatures,
        parkModalOpen,
        parkName,
        prefetchParkName,
        position,
        setParkModalOpen,
        userOrientationEnabled,
    } = useGeolocationTracking({
        debug,
        map,
        resonanceAudioScene,
        stopSound,
    });

    const debugPosition = position ? toLonLat(position.slice(0, 2)) as [number, number] : null;
    const audioBuffer = buffers && "duration" in buffers ? buffers : null;
    const prefetchUrls = useMemo(() => {
        if (!prefetchParkName) {
            return null;
        }

        return pickSoundPath(prefetchParkName, stateParks, navigator.userAgent);
    }, [prefetchParkName]);

    const handleGeolocationChange = useCallback((event: { target: OLGeoLoc }) => {
        onGeolocationChange(event);
    }, [onGeolocationChange]);

    useRenderDebug("GeolocationOverlay", {
        debug,
        parkModalOpen,
        parkName,
        prefetchParkName,
        hasPosition: Boolean(position),
        isLoading,
        isPlaying,
        hasBuffers: Boolean(buffers),
        loadError,
    });

    useEffect(() => {
        if (!audioContext || !prefetchUrls?.length) {
            return;
        }

        void preloadBuffers(prefetchUrls);
    }, [audioContext, prefetchUrls, preloadBuffers]);

    return (
        <div>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}
                onChange={handleGeolocationChange}
            />

            <RLayerVector zIndex={10}>
                <RStyle.RStyle>
                    <RStyle.RIcon src={locationIcon} anchor={[0.5, 0.8]} />
                    <RStyle.RStroke color={"#007bff"} width={3} />
                </RStyle.RStyle>
                {position && <RFeature geometry={new Point(position)}></RFeature>}
                {accuracy && <RFeature geometry={accuracy as LineString}></RFeature>}
            </RLayerVector>

            <ParkFeatureLayers parkFeatures={parkFeatures} maxDistance={maxDistance} />

            <ErrorBoundary fallback={<div>Error</div>}>
                {parkModalOpen && (
                    <ParkModal
                        isOpen={parkModalOpen}
                        setIsOpen={setParkModalOpen}
                        parkName={parkName}
                        parkDistance={parkDistance}
                        userOrientation={userOrientationEnabled}
                    />
                )}
            </ErrorBoundary>

            {debug && (
                <GeolocationDebugPanel
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
            )}
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
