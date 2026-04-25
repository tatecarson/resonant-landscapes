import { Fragment, useRef, memo, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioEngine, useAudioPlaybackState } from "../contexts/AudioContextProvider";
import { useRenderDebug } from "../hooks/useRenderDebug";
import HOARenderer from './HoaRenderer';
import AmbientGradient from './AmbientGradient';
import { hasStoredOrientationPermission, requestDeviceOrientationPermission } from "../utils/deviceOrientation";

const CENTER_ROTATION_RADIUS_METERS = 3;

interface ParkModalProps {
    setIsOpen: (value: boolean) => void;
    isOpen: boolean;
    parkName: string;
    parkDistance: number;
    userOrientation: boolean;
    mapHeading: number;
    compact?: boolean;
    suppressed?: boolean;
}

function ParkModal({
    setIsOpen,
    isOpen,
    parkName,
    parkDistance,
    userOrientation,
    mapHeading,
    compact = false,
    suppressed = false,
}: ParkModalProps) {
    const { stopSound } = useAudioEngine();
    const { isPlaying } = useAudioPlaybackState();
    const [rotationActive, setRotationActive] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(() => hasStoredOrientationPermission());
    const [rotationDismissed, setRotationDismissed] = useState(false);
    const userAtRotationCenter = parkDistance <= CENTER_ROTATION_RADIUS_METERS;
    const showRotationButton = isPlaying && userAtRotationCenter && userOrientation;
    const showRotationAffordance = showRotationButton && !rotationActive;

    useRenderDebug("ParkModal", {
        isOpen,
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        compact,
        suppressed,
        rotationActive,
        permissionGranted,
    });

    const cancelButtonRef = useRef(null);

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

    function cancel() {
        console.log('Cancelling...');
        stopSound();
        setIsOpen(false);
    }

    async function enableRotation() {
        if (!permissionGranted) {
            const granted = await requestDeviceOrientationPermission();
            if (!granted) {
                return;
            }
            setPermissionGranted(true);
        }

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
    };

    if (compact || rotationActive) {
        return (
            <>
                <AmbientGradient active={rotationActive && !suppressed} headingRadians={mapHeading} />
                <div
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
                                    className="mt-1 flex-shrink-0 font-space-mono text-[8px] uppercase tracking-[0.2em] text-neutral-900/40"
                                    aria-label="Spatial tracking active"
                                >
                                    ↻ tracking
                                </span>
                            )}
                        </div>

                        <div className="mt-0.5 flex items-center gap-1.5">
                            {isPlaying && (
                                <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-900/60 animate-pulse" aria-hidden="true" />
                            )}
                            <p className="font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/45">
                                {Math.floor(parkDistance)} m away
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="my-3 h-px bg-neutral-900/10" />

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
                                        className="font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/45 transition-colors hover:text-neutral-900/70"
                                    >
                                        × stop tracking
                                    </button>
                                )}
                                {!rotationActive && showRotationButton && (
                                    <button
                                        onClick={() => { void enableRotation(); }}
                                        className="rotation-affordance rounded-full px-2.5 py-1 font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/50 underline underline-offset-2 decoration-neutral-900/25 transition-colors hover:text-neutral-900/75"
                                        data-emphasized={showRotationAffordance}
                                    >
                                        Enable rotation
                                    </button>
                                )}
                                {!rotationActive && !showRotationButton && (
                                    <span className="font-space-mono text-[9px] uppercase tracking-[0.18em] text-neutral-900/25 select-none">
                                        ✦
                                    </span>
                                )}
                            </div>

                            {/* Right: audio controls */}
                            <HOARenderer {...hoaRendererProps} compact hideStatusLabel />
                        </div>

                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <AmbientGradient active={rotationActive} headingRadians={mapHeading} />
            <Transition.Root show={isOpen} as={Fragment}>
                <Dialog as="div" className="relative z-10" initialFocus={cancelButtonRef} onClose={setIsOpen}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-neutral-900/20 transition-opacity" />
                    </Transition.Child>

                    <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                        <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                                enterTo="opacity-100 translate-y-0 sm:scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            >
                                <Dialog.Panel className="relative w-full rounded-2xl bg-[#8ecdc0] p-8 shadow-2xl sm:my-8 sm:max-w-md">
                                    {/* decorative top rule */}
                                    <div className="mb-6 flex items-center gap-3">
                                        <div className="h-px flex-1 bg-neutral-900/25" />
                                        <span className="font-space-mono text-xs tracking-widest text-neutral-900/40">✦</span>
                                        <div className="h-px flex-1 bg-neutral-900/25" />
                                    </div>

                                    <Dialog.Title
                                        as="h2"
                                        className="font-cormorant text-5xl italic font-light tracking-tight text-neutral-900"
                                    >
                                        {parkName}
                                    </Dialog.Title>
                                    <p className="font-space-mono mt-1 text-[10px] uppercase tracking-widest text-neutral-900/50">
                                        {Math.floor(parkDistance)} meters away
                                    </p>

                                    <div className="mt-6">
                                        <HOARenderer {...hoaRendererProps} />
                                    </div>

                                    {!rotationActive && showRotationButton && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void enableRotation();
                                            }}
                                            className="rotation-affordance mt-4 w-full rounded-full border border-neutral-900/40 bg-transparent px-6 py-2 font-space-mono text-xs tracking-widest uppercase text-neutral-900/70 transition-colors hover:border-neutral-900 hover:text-neutral-900"
                                            data-emphasized={showRotationAffordance}
                                        >
                                            Enable Rotation
                                        </button>
                                    )}

                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            className="w-full rounded-full bg-neutral-900 px-6 py-3 font-space-mono text-xs tracking-widest uppercase text-white transition-colors hover:bg-neutral-700"
                                            onClick={cancel}
                                            ref={cancelButtonRef}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition.Root>
        </>
    );
}

export default memo(ParkModal)
