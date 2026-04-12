import { Fragment, useRef, memo } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioEngine } from "../contexts/AudioContextProvider";
import { useRenderDebug } from "../hooks/useRenderDebug";
import HOARenderer from './HoaRenderer';

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
    useRenderDebug("ParkModal", {
        isOpen,
        parkName,
        parkDistance: Math.floor(parkDistance),
        userOrientation,
        compact,
    });

    const cancelButtonRef = useRef(null);

    function cancel() {
        console.log('Cancelling...');
        stopSound();
        setIsOpen(false);
    }

    if (compact) {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-900/20 bg-[#8ecdc0] px-5 py-3 shadow-lg">
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="font-cormorant italic truncate text-xl font-light text-neutral-900">{parkName}</p>
                        <p className="font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/50">{Math.floor(parkDistance)} m away</p>
                    </div>
                    <HOARenderer
                        parkName={parkName}
                        parkDistance={parkDistance}
                        userOrientation={userOrientation}
                        compact
                    />
                </div>
            </div>
        );
    }

    return (
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
                                    <HOARenderer
                                        parkName={parkName}
                                        parkDistance={parkDistance}
                                        userOrientation={userOrientation}
                                    />
                                </div>

                                <div className="mt-8">
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
    )
}

export default memo(ParkModal)
