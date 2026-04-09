import { useState } from "react";
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
import { useAudioContext } from "../contexts/AudioContextProvider";
import { useGeolocationTracking } from "../hooks/useGeolocationTracking";
import locationIcon from "../assets/geolocation_marker_heading.png";

function GeolocationOverlay({ debug = false }: { debug?: boolean }): JSX.Element {
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

    return (
        <div>
            <RGeolocation
                tracking={true}
                trackingOptions={{ enableHighAccuracy: true }}
                onChange={(event: { target: OLGeoLoc }) => onGeolocationChange(event)}
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

    return (
        <RMap
            className="map"
            initial={{ center: fromLonLat([0, 0]), zoom: 19 }}
        >
            <RControl.RCustom className="example-control">
                <button onClick={() => setHelpIsOpen(true)}>
                    ?
                </button>
            </RControl.RCustom>
            {helpIsOpen && <HelpModal isOpen={helpIsOpen} setIsOpen={setHelpIsOpen} />}
            <ROSM />
            <GeolocationOverlay debug={debug} />
        </RMap>
    );
}
