import { useRef, Fragment, useCallback, useMemo } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioContext } from "../contexts/AudioContextProvider";
import { readPreflightEnv, runPreflight } from "../utils/capabilities";
import type { Variant } from "../App";

interface WelcomeModalProps {
    isOpen: boolean;
    setIsOpen: (value: boolean) => void;
    variant?: Variant;
}

function WelcomeModal({ isOpen, setIsOpen, variant = "dsu" }: WelcomeModalProps) {
    const cancelButtonRef = useRef(null);
    const { unlockAudio, lastUnlockError } = useAudioContext();
    // Nothing here changes for the life of the page, and the walker should
    // learn about a missing capability before they leave the house rather
    // than at the park.
    const preflight = useMemo(() => runPreflight(readPreflightEnv(window)), []);
    const onlyNeedsAPhone =
        preflight.problems.length === 1 && preflight.problems[0].id === "phone";

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
                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-neutral-900/70 mb-7">
                                    a locative sound walk
                                </p>

                                {preflight.problems.length > 0 && (
                                    <div
                                        className="mb-7 rounded-2xl border border-neutral-900/25 bg-white/30 p-4"
                                        data-testid="capability-preflight"
                                    >
                                        <p className="font-space-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-900">
                                            {preflight.verdict === "blocked"
                                                ? "The walk will not work here"
                                                : onlyNeedsAPhone
                                                    // Nothing is broken on a desktop — it is simply
                                                    // the wrong device, and saying "will not work"
                                                    // would read as a fault to go and fix.
                                                    ? "This walk needs a phone"
                                                    : "Part of the walk will not work here"}
                                        </p>
                                        <ul className="mt-2 font-space-mono space-y-2 text-[10px] leading-relaxed text-neutral-900/75">
                                            {preflight.problems.map((problem) => (
                                                <li key={problem.id} className="flex gap-3">
                                                    <span className="select-none text-neutral-900/40">—</span>
                                                    <span>{problem.detail}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

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

                                <p className="mt-6 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70">
                                    Use headphones — non-noise-canceling preferred.
                                </p>
                                <p className="mt-2 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70">
                                    {preflight.orientationNeedsPermission
                                        ? "Start will request audio access. Rotation access comes later, when you need it."
                                        : "Start will request audio access."}
                                </p>

                                <div className="mt-8">
                                    <button
                                        type="button"
                                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8ecdc0] inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-neutral-900 px-6 py-3 font-space-mono text-xs tracking-widest uppercase text-white transition-colors hover:bg-neutral-700"
                                        onClick={() => {
                                            void handleBegin();
                                        }}
                                        ref={cancelButtonRef}
                                    >
                                        {preflight.verdict === "blocked" ? "Start anyway" : "Start"}
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
