import { useRef, Fragment, useCallback, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioContext } from "../contexts/AudioContextProvider";
import { readPreflightEnv, runPreflight } from "../utils/capabilities";
import { isDebugEnabled } from "../config/debug";
import { welcome } from "../copy";
import { detectPlatform } from "../utils/recoverySteps";
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
    const inAppBrowser = preflight.webviewHost !== null;
    // The escape route is the headline when it is the only thing wrong. If
    // sound is missing too, the blocked wording is the more urgent of the two
    // and the escape route stays below as a step to take.
    const onlyInAppBrowser =
        preflight.problems.length === 1 && preflight.problems[0].id === "browser";
    const platform = useMemo(() => detectPlatform(navigator.userAgent), []);
    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

    // There is no way to open Safari from inside a webview, so the link is
    // put on the clipboard and the walker pastes it. Some webviews refuse
    // even that, which is why the failure has its own sentence.
    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopyState("copied");
        } catch (error) {
            console.error("Could not copy the walk link:", error);
            setCopyState("failed");
        }
    }, []);

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
                                    {welcome.title}
                                </Dialog.Title>
                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-neutral-900/70 mb-7">
                                    {welcome.subtitle}
                                </p>

                                {preflight.problems.length > 0 && (
                                    <div
                                        className="mb-7 rounded-2xl border border-neutral-900/25 bg-white/30 p-4"
                                        data-testid="capability-preflight"
                                    >
                                        <p className="font-space-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-900">
                                            {preflight.verdict === "blocked"
                                                ? welcome.preflight.blocked
                                                : onlyInAppBrowser
                                                ? welcome.preflight.inAppBrowser
                                                : onlyNeedsAPhone
                                                    // Nothing is broken on a desktop. It is simply
                                                    // the wrong device, and saying "will not work"
                                                    // would read as a fault to go and fix.
                                                    ? welcome.preflight.needsPhone
                                                    : welcome.preflight.partial}
                                        </p>
                                        <ul className="mt-2 font-space-mono space-y-2 text-[10px] leading-relaxed text-neutral-900/75">
                                            {preflight.problems.map((problem) => (
                                                <li key={problem.id} className="flex gap-3">
                                                    <span className="select-none text-neutral-900/40">—</span>
                                                    <span>{problem.detail}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {inAppBrowser && (
                                            <div className="mt-3 border-t border-neutral-900/15 pt-3" data-testid="open-in-browser">
                                                <p className="font-space-mono text-[10px] leading-relaxed text-neutral-900/75">
                                                    {welcome.openInBrowser.steps[platform]}
                                                </p>
                                                <button
                                                    type="button"
                                                    aria-label={welcome.openInBrowser.copyLinkAriaLabel}
                                                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8ecdc0] mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-neutral-900/40 px-5 py-2 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900 transition-colors hover:bg-neutral-900/10"
                                                    onClick={() => {
                                                        void handleCopyLink();
                                                    }}
                                                >
                                                    {welcome.openInBrowser.copyLink}
                                                </button>
                                                {copyState !== "idle" && (
                                                    <p
                                                        className="mt-2 font-space-mono text-[10px] leading-relaxed text-neutral-900/75"
                                                        role="status"
                                                        data-testid="copy-link-status"
                                                    >
                                                        {copyState === "copied"
                                                            ? welcome.openInBrowser.copied
                                                            : welcome.openInBrowser.copyFailed}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="font-space-mono space-y-4 text-[12px] leading-relaxed text-neutral-900/75">
                                    <p>{welcome.intro(variant)}</p>
                                    {welcome.steps.map((step) => (
                                        <p key={step}>{step}</p>
                                    ))}
                                </div>

                                <p className="mt-6 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70">
                                    {welcome.headphones}
                                </p>
                                <p className="mt-2 font-space-mono text-[10px] uppercase tracking-widest text-neutral-900/70">
                                    {preflight.orientationNeedsPermission
                                        ? welcome.accessWithRotation
                                        : welcome.accessAudioOnly}
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
                                        {preflight.verdict === "blocked" ? welcome.startAnyway : welcome.start}
                                    </button>
                                </div>

                                {lastUnlockError && (
                                    <div className="mt-3" data-testid="unlock-error">
                                        <p className="font-space-mono text-[10px] uppercase tracking-widest text-rose-700">
                                            {welcome.unlockFailed}
                                        </p>
                                        {/*
                                          * The exception itself is deliberately not
                                          * above, the same way HoaRenderer keeps it out
                                          * of the park strip. It cannot be acted on by
                                          * someone about to set off, and it reads as a
                                          * crash rather than a button to press again.
                                          */}
                                        {isDebugEnabled() && (
                                            <pre
                                                className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-[10px] text-rose-800"
                                                data-testid="unlock-error-detail"
                                            >
                                                {lastUnlockError}
                                            </pre>
                                        )}
                                    </div>
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
