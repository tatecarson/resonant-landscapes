import { useRef, Fragment, useCallback } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioContext } from "../contexts/AudioContextProvider";
import type { Variant } from "../App";

interface WelcomeModalProps {
    isOpen: boolean;
    setIsOpen: (value: boolean) => void;
    variant?: Variant;
}

function WelcomeModal({ isOpen, setIsOpen, variant = "dsu" }: WelcomeModalProps) {
    const cancelButtonRef = useRef(null);
    const { unlockAudio, lastUnlockError } = useAudioContext();

    const handleBegin = useCallback(async () => {
        try {
            const didUnlockAudio = await unlockAudio();
            if (!didUnlockAudio) {
                return;
            }

            setIsOpen(false);
        } catch (error) {
            console.error("Error unlocking audio from welcome modal:", error);
        }
    }, [setIsOpen, unlockAudio]);

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
                    <div className="fixed inset-0 bg-neutral-900/60 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 w-screen overflow-y-auto">
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
                                    <span className="text-xs text-neutral-900/40 font-space-mono tracking-widest">✦</span>
                                    <div className="h-px flex-1 bg-neutral-900/25" />
                                </div>

                                <Dialog.Title
                                    as="h1"
                                    className="font-cormorant text-5xl italic font-light tracking-tight text-neutral-900 mb-1"
                                >
                                    Resonant Landscapes
                                </Dialog.Title>
                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-neutral-900/50 mb-7">
                                    a locative sound walk
                                </p>

                                <div className="font-space-mono space-y-4 text-[12px] leading-relaxed text-neutral-900/75">
                                    <p>
                                        {variant === "terrace"
                                            ? "Walk Terrace Park to hear the soundscapes of South Dakota's 13 state parks."
                                            : "Walk DSU's campus to hear the soundscapes of South Dakota's 13 state parks."}
                                    </p>
                                    <p>As you approach a park, a menu opens. Walk closer to the center icon and the volume increases with proximity.</p>
                                    <p>At the center of a listening spot, turn with your phone to hear the recording in 360 degrees.</p>
                                    <p>Close the menu to load a different recording. Walk away or press stop to end.</p>
                                </div>

                                <p className="mt-6 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/55">
                                    Use headphones — non-noise-canceling preferred.
                                </p>
                                <p className="mt-2 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/55">
                                    Start will request audio access. Rotation access comes later, when you need it.
                                </p>

                                <div className="mt-8">
                                    <button
                                        type="button"
                                        className="w-full rounded-full bg-neutral-900 px-6 py-3 font-space-mono text-xs tracking-widest uppercase text-white transition-colors hover:bg-neutral-700"
                                        onClick={() => {
                                            void handleBegin();
                                        }}
                                        ref={cancelButtonRef}
                                    >
                                        Start 
                                    </button>
                                </div>

                                {lastUnlockError && (
                                    <p className="mt-3 font-space-mono text-[10px] uppercase tracking-widest text-rose-700">
                                        Audio unlock failed: {lastUnlockError}
                                    </p>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}

export default WelcomeModal;
