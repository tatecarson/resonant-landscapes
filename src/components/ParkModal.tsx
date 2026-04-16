import { Fragment, useRef, memo, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioEngine, useAudioPlaybackState } from "../contexts/AudioContextProvider";
import { useRenderDebug } from "../hooks/useRenderDebug";
import HOARenderer from './HoaRenderer';
import AmbientGradient from './AmbientGradient';
import { hasStoredOrientationPermission, requestDeviceOrientationPermission } from "../utils/deviceOrientation";

interface ParkModalProps {
    setIsOpen: (value: boolean) => void;
    isOpen: boolean;
    parkName: string;
    parkDistance: number;
    userOrientation: boolean;
    compact?: boolean;
}

function ParkModal({ setIsOpen, isOpen, parkName, parkDistance, userOrientation, compact = false }: ParkModalProps) {
    const { stopSound } = useAudioEngine();
    const { isPlaying } = useAudioPlaybackState();
    const [rotationActive, setRotationActive] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(() => hasStoredOrientationPermission());
    const showRotationButton = isPlaying && parkDistance <= 3 && userOrientation;

    useRenderDebug("ParkModal", {
        isOpen,
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        compact,
        rotationActive,
        permissionGranted,
    });

    const cancelButtonRef = useRef(null);

    // Reset rotation state when park changes
    useEffect(() => {
        setRotationActive(false);
        setPermissionGranted(hasStoredOrientationPermission());
    }, [parkName]);

    // Deactivate rotation when playback stops
    useEffect(() => {
        if (!isPlaying) setRotationActive(false);
    }, [isPlaying]);

    // Auto-enable rotation when all conditions are met at park center
    useEffect(() => {
        if (!showRotationButton || rotationActive) return;
        setRotationActive(true);
    }, [showRotationButton, rotationActive]);

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
                <AmbientGradient active={rotationActive} />
                <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-900/20 bg-[#8ecdc0] px-5 py-3 shadow-lg">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="font-cormorant italic truncate text-xl font-light text-neutral-900">{parkName}</p>
                            <p className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/50">{Math.floor(parkDistance)} m away</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {!rotationActive && showRotationButton && (
                                <button
                                    onClick={() => {
                                        void enableRotation();
                                    }}
                                    className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70 transition-colors hover:text-neutral-900"
                                >
                                    Enable Rotation
                                </button>
                            )}
                            {rotationActive && (
                                <button
                                    onClick={() => setRotationActive(false)}
                                    className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/50 transition-colors hover:text-neutral-900"
                                >
                                    Stop Tracking
                                </button>
                            )}
                            <HOARenderer {...hoaRendererProps} compact />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <AmbientGradient active={rotationActive} />
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
                                            className="mt-4 w-full rounded-full border border-neutral-900/40 bg-transparent px-6 py-2 font-space-mono text-xs tracking-widest uppercase text-neutral-900/70 transition-colors hover:border-neutral-900 hover:text-neutral-900"
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
