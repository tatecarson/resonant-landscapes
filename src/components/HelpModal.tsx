import { useRef, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'

interface HelpModalProps {
    isOpen: boolean;
    setIsOpen: (value: boolean) => void;
}

function HelpModal({ isOpen, setIsOpen }: HelpModalProps) {
    const cancelButtonRef = useRef(null);

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
                                    as="h2"
                                    className="font-cormorant text-5xl italic font-light tracking-tight text-neutral-900 mb-1"
                                >
                                    Help &amp; About
                                </Dialog.Title>
                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-neutral-900/50 mb-7">
                                    things to try · credits
                                </p>

                                <ul className="font-space-mono space-y-3 text-[12px] leading-relaxed text-neutral-900/75">
                                    <li className="flex gap-3">
                                        <span className="select-none text-neutral-900/40">—</span>
                                        <span>Turn WiFi off for best results.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="select-none text-neutral-900/40">—</span>
                                        <span>No sound? Refresh the page or reopen the browser.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="select-none text-neutral-900/40">—</span>
                                        <span>Make sure geolocation is enabled in your phone and browser settings.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="select-none text-neutral-900/40">—</span>
                                        <span>Tested on iOS with Safari — other devices may not work.</span>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="select-none text-neutral-900/40">—</span>
                                        <span>
                                            Questions?{' '}
                                            <a
                                                href="mailto:tate.carson@dsu.edu"
                                                className="text-neutral-900 underline decoration-neutral-900/40 underline-offset-2 transition-colors hover:decoration-neutral-900"
                                            >
                                                Tate Carson
                                            </a>
                                        </span>
                                    </li>
                                </ul>

                                <div className="mt-8 mb-6 flex items-center gap-3">
                                    <div className="h-px flex-1 bg-neutral-900/25" />
                                    <span className="text-xs text-neutral-900/40 font-space-mono tracking-widest">✦</span>
                                    <div className="h-px flex-1 bg-neutral-900/25" />
                                </div>

                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-neutral-900/50 mb-3">
                                    about
                                </p>
                                <div className="font-space-mono space-y-3 text-[12px] leading-relaxed text-neutral-900/75">
                                    <p>
                                        By Tate Carson and Carter Gordon. Carter co-recorded the soundscapes
                                        and traveled to many of the state parks.
                                    </p>
                                    <p>
                                        <a
                                            href="https://dl.acm.org/doi/10.1145/3678299.3678354"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-neutral-900 underline decoration-neutral-900/40 underline-offset-2 transition-colors hover:decoration-neutral-900"
                                        >
                                            Read the paper (AM '24)
                                        </a>
                                    </p>
                                    <p>
                                        <a
                                            href="https://www.tatecarson.com/blog/2024-09-29-resonant-landscapes"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-neutral-900 underline decoration-neutral-900/40 underline-offset-2 transition-colors hover:decoration-neutral-900"
                                        >
                                            Project page — photos, code, and more
                                        </a>
                                    </p>
                                </div>

                                <div className="mt-8">
                                    <button
                                        type="button"
                                        className="w-full rounded-full bg-neutral-900 px-6 py-3 font-space-mono text-xs tracking-widest uppercase text-white transition-colors hover:bg-neutral-700"
                                        onClick={() => setIsOpen(false)}
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

export default HelpModal;
