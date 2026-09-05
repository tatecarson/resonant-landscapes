import { useRef, memo, useState, useEffect, useMemo } from 'react'
import { useAudioPlaybackState } from "../contexts/AudioContextProvider";
import { useRenderDebug } from "../hooks/useRenderDebug";
import HOARenderer from './HoaRenderer';
import AmbientGradient from './AmbientGradient';
import PermissionRecovery from './PermissionRecovery';
import { park as parkCopy } from '../copy';
import { hasStoredOrientationPermission, requestDeviceOrientationPermission } from "../utils/deviceOrientation";
import { CENTER_ROTATION_RADIUS_METERS } from "../config/geofence";
import { selectVariant } from "../utils/audioPaths";
import { useActiveReplayVariant } from "../hooks/activeReplay";
import stateParks from "../data/stateParks.json";


interface ParkModalProps {
    parkName: string;
    parkDistance: number;
    userOrientation: boolean;
    mapHeading: number;
    suppressed?: boolean;
}

function ParkModal({
    parkName,
    parkDistance,
    userOrientation,
    mapHeading,
    suppressed = false,
}: ParkModalProps) {
    const { isPlaying } = useAudioPlaybackState();
    const [rotationActive, setRotationActive] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(() => hasStoredOrientationPermission());
    const [rotationDismissed, setRotationDismissed] = useState(false);
    // Set when the walker asked for rotation and the device said no. Until
    // now this branch did nothing at all: the button was tapped, the promise
    // resolved "denied", and the UI did not move — which reads as a broken
    // button rather than a setting they can go and change.
    const [rotationBlocked, setRotationBlocked] = useState(false);
    const userAtRotationCenter = parkDistance <= CENTER_ROTATION_RADIUS_METERS;
    const showRotationButton = isPlaying && userAtRotationCenter && userOrientation;

    useRenderDebug("ParkModal", {
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        suppressed,
        rotationActive,
        permissionGranted,
    });

    /**
     * Which of a park's recordings this walker is hearing. The seed draws
     * one per session — stable for the visit, different across visits, and
     * that variety is deliberate. When the walk is replaying a held
     * recording instead of the seed's choice, the replay's number wins: the
     * sentence has to describe what is playing, not what was drawn.
     */
    const seededVariant = useMemo(
        () => (parkName ? selectVariant(parkName, stateParks, navigator.userAgent) : null),
        [parkName]
    );
    const replayVariantNumber = useActiveReplayVariant(parkName);
    const variant = useMemo(
        () => (seededVariant && replayVariantNumber
            ? { ...seededVariant, number: replayVariantNumber }
            : seededVariant),
        [seededVariant, replayVariantNumber]
    );

    /**
     * aria-hidden on a container whose Stop and rotation buttons stay
     * focusable is undefined behaviour: the ARIA spec says hidden subtrees
     * leave the accessibility tree, but a focusable element inside one is a
     * contradiction assistive tech resolves differently. On a phone that
     * reaches iOS Switch Control and Android Switch Access, which step through
     * focusable elements — the mobile equivalent of tabbing — and a paired
     * keyboard with Full Keyboard Access.
     *
     * `inert` resolves it properly by removing the subtree from focus order
     * as well. React 18 does not forward the attribute, so it is set on the
     * node directly.
     */
    const suppressedStripRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const strip = suppressedStripRef.current;
        if (!strip) {
            return;
        }

        if (suppressed) {
            strip.setAttribute("inert", "");
        } else {
            strip.removeAttribute("inert");
        }
    }, [suppressed]);

    // Reset rotation state when park changes
    useEffect(() => {
        setRotationActive(false);
        setPermissionGranted(hasStoredOrientationPermission());
        setRotationDismissed(false);
    }, [parkName]);

    // Deactivate rotation when playback stops; also clear dismissed flag so
    // auto-enable can fire again when the user next starts audio.
    useEffect(() => {
        if (!isPlaying) {
            setRotationActive(false);
            setRotationDismissed(false);
        }
    }, [isPlaying]);

    // Reset the manual dismissal when the user leaves center conditions.
    useEffect(() => {
        if (!showRotationButton) {
            setRotationDismissed(false);
        }
    }, [showRotationButton]);

    // Rotation is only valid at the listening spot center. Clear it as soon as
    // GPS moves outside the center radius, even while the active park remains open.
    useEffect(() => {
        if (rotationActive && !userAtRotationCenter) {
            setRotationActive(false);
        }
    }, [rotationActive, userAtRotationCenter]);

    // Auto-enable rotation when all conditions are met at park center.
    useEffect(() => {
        if (!permissionGranted || !showRotationButton || rotationActive || rotationDismissed) {
            return;
        }

        setRotationActive(true);
    }, [permissionGranted, rotationDismissed, rotationActive, showRotationButton]);

    async function enableRotation() {
        if (!permissionGranted) {
            const granted = await requestDeviceOrientationPermission();
            if (!granted) {
                setRotationBlocked(true);
                return;
            }
            setPermissionGranted(true);
        }

        setRotationBlocked(false);

        setRotationDismissed(false); // user explicitly re-enabled — clear any prior dismissal
        setRotationActive(true);
    }

    const hoaRendererProps = {
        parkName,
        parkDistance,
        userOrientation,
        rotationActive,
        onRotationActiveChange: setRotationActive,
        permissionGranted,
        onPermissionGranted: () => setPermissionGranted(true),
        // iOS only accepts requestPermission() during a user gesture, so
        // "re-prompt" means putting the Enable Rotation button back rather
        // than prompting from here — which would throw NotAllowedError.
        onOrientationUnavailable: () => {
            setRotationActive(false);
            setPermissionGranted(false);
            setRotationDismissed(false);
            setRotationBlocked(true);
        },
    };

    return (
        <>
                <AmbientGradient active={rotationActive && !suppressed} headingRadians={mapHeading} />

                <div
                    ref={suppressedStripRef}
                    className={`fixed bottom-0 left-0 right-0 z-50 bg-[#8ecdc0] shadow-[0_-1px_0_rgba(0,0,0,0.10),0_-12px_32px_rgba(0,0,0,0.08)] transition-opacity duration-150 ${
                        suppressed ? "pointer-events-none opacity-0" : "opacity-100"
                    }`}
                    aria-hidden={suppressed}
                >
                    <div className="px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))]">

                        {/* Park identity */}
                        <div className="flex items-start justify-between gap-3">
                            <p className="font-cormorant italic text-[22px] leading-tight font-light text-neutral-900 min-w-0 truncate">
                                {parkName}
                            </p>
                            {rotationActive && (
                                <span
                                    className="mt-1 flex-shrink-0 font-space-mono text-[8px] uppercase tracking-[0.2em] text-neutral-900/70"
                                    aria-label={parkCopy.trackingAriaLabel}
                                >
                                    {parkCopy.tracking}
                                </span>
                            )}
                        </div>

                        <div className="mt-0.5 flex items-center gap-1.5">
                            {isPlaying && (
                                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-900/60 animate-pulse" aria-hidden="true" />
                            )}
                            <p className="font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/70">
                                {Math.floor(parkDistance)} m away
                                {variant && variant.total > 1
                                    ? ` · ${parkCopy.recordingOf(variant.number, variant.total)}`
                                    : ""}
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="my-3 h-px bg-neutral-900/10" />

                        {/*
                          * Above the controls, for the reason the silent-mode
                          * hint is (rl-1u7.18). This panel is 323px tall and
                          * used to render after the controls row, so on a
                          * phone that has refused orientation access it stood
                          * between STOP and the strip's anchored bottom edge
                          * and lifted the button most of a screen — the same
                          * failure as the hint's 23px, several times over.
                          *
                          * Opening upward is also the better read: the panel
                          * explains something, and the controls it explains
                          * stay where the thumb already found them.
                          */}
                        {rotationBlocked && (
                            <div className="mb-3">
                                <PermissionRecovery
                                    capability="orientation"
                                    onDismiss={() => setRotationBlocked(false)}
                                />
                            </div>
                        )}

                        {/* Controls row */}
                        <div className="flex items-center justify-between gap-4">

                            {/* Left: rotation secondary action */}
                            <div className="flex-shrink-0">
                                {rotationActive && (
                                    <button
                                        onClick={() => {
                                            setRotationDismissed(true);
                                            setRotationActive(false);
                                        }}
                                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8ecdc0] rounded-full inline-flex min-h-[44px] items-center px-1 font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/70 transition-colors hover:text-neutral-900"
                                    >
                                        {parkCopy.stopTracking}
                                    </button>
                                )}
                                {/*
                                  * Hidden while the recovery panel is up. Once
                                  * iOS has been told no, requestPermission
                                  * resolves "denied" without prompting, so the
                                  * button is a no-op that still looks live —
                                  * the same dead end the panel exists to fix.
                                  * "Continue without it" brings it back.
                                  */}
                                {!rotationActive && showRotationButton && !rotationBlocked && (
                                    <button
                                        onClick={() => { void enableRotation(); }}
                                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8ecdc0] rotation-affordance inline-flex min-h-[44px] items-center rounded-full px-2.5 py-1 font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/70 underline underline-offset-2 decoration-neutral-900/40 transition-colors hover:text-neutral-900"
                                    >
                                        {parkCopy.enableRotation}
                                    </button>
                                )}
                                {/* Also stands in while the recovery panel has
                                    taken the button's place, so the row keeps
                                    its balance instead of going half empty. */}
                                {!rotationActive && (!showRotationButton || rotationBlocked) && (
                                    <span className="font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/25 select-none">
                                        ✦
                                    </span>
                                )}
                            </div>

                            {/* Right: audio controls */}
                            <HOARenderer {...hoaRendererProps} />
                        </div>

                    </div>
                </div>
        </>
    );
}

export default memo(ParkModal)
