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

/**
 * How long Start waits before saying it is working on it. An unlock that
 * answers at once should close the welcome screen without a word flickering
 * through the button on the way out; only a wait long enough to be mistaken
 * for a dead button is worth describing (rl-7om).
 */
const STARTING_LABEL_DELAY_MS = 400;

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
    // Set when Start could not unlock audio. unlockAudio records its own
    // failures in lastUnlockError, but its contract is a boolean: a false
    // arriving without a message would otherwise leave the walker no escape.
    const [unlockFailed, setUnlockFailed] = useState(false);
    // Set for as long as a press is being answered. The walk downloads its
    // audio engine while this screen is up, and Start waits for that before
    // it can unlock anything, so on the signal a walker has at a park the
    // press can go unanswered for seconds (rl-7om). isBeginning is the fact;
    // showStarting is whether it has lasted long enough to say so.
    const [isBeginning, setIsBeginning] = useState(false);
    const [showStarting, setShowStarting] = useState(false);
    const startingTimerRef = useRef<number | undefined>(undefined);

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
        // The button stays focusable while it works — aria-disabled rather
        // than disabled, so a walker on a screen reader is not dropped out of
        // the control they just pressed — which leaves the second press to be
        // turned away here.
        if (isBeginning) {
            return;
        }

        setIsBeginning(true);
        startingTimerRef.current = window.setTimeout(
            () => setShowStarting(true),
            STARTING_LABEL_DELAY_MS
        );

        try {
            // Awaited whole, not raced against a timer here: the bound that
            // stops a never-settling resume belongs around the resume itself
            // (UNLOCK_SETTLE_MS in AudioContextProvider), so a slow engine
            // boot is waited out rather than reported as a refusal — and the
            // answer, whenever it arrives, is the one acted on.
            const didUnlockAudio = await unlockAudio();
            if (!didUnlockAudio) {
                setUnlockFailed(true);
                return;
            }

            setIsOpen(false);
        } catch (error) {
            console.error("Error unlocking audio from welcome modal:", error);
            setUnlockFailed(true);
        } finally {
            // unlockAudio always settles now — the engine init resolves either
            // way and the resume is bounded — so this always runs, and the
            // walker is never left holding a button that says it is working.
            window.clearTimeout(startingTimerRef.current);
            setIsBeginning(false);
            setShowStarting(false);
        }
    }, [isBeginning, setIsOpen, unlockAudio]);

    return (
        <Transition.Root show={isOpen} as={Fragment}>
            {/*
              * onClose does nothing on purpose. This is the app's first screen
              * rather than a dialog over something: App.tsx does not mount the
              * map until this closes, so a backdrop tap uncovers an empty page
              * and drops the walker onto a map with the sound still locked. The
              * only ways out are Start, and the deliberate one offered below
              * once Start has failed.
              */}
            <Dialog as="div" className="relative z-10" initialFocus={cancelButtonRef} onClose={() => {}}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-ink/60 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 w-screen overflow-y-auto">
                    <div className="modal-viewport flex min-h-full items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-0 sm:pb-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="modal-panel relative flex w-full flex-col overflow-y-auto overscroll-contain rounded-2xl bg-panel px-8 pt-8 shadow-2xl sm:my-8 sm:max-w-md">
                                {/* decorative top rule */}
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="h-px flex-1 bg-ink/25" />
                                    <span className="text-xs text-ink/40 font-mono tracking-widest">✦</span>
                                    <div className="h-px flex-1 bg-ink/25" />
                                </div>

                                <Dialog.Title
                                    as="h1"
                                    className="font-display text-5xl font-medium tracking-tight text-ink mb-1"
                                >
                                    {welcome.title}
                                </Dialog.Title>
                                <p className="font-mono text-[10px] tracking-widest uppercase text-ink/70 mb-7">
                                    {welcome.subtitle}
                                </p>

                                {preflight.problems.length > 0 && (
                                    <div
                                        className="mb-7 rounded-2xl border border-ink/25 bg-white/30 p-4"
                                        data-testid="capability-preflight"
                                    >
                                        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink">
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
                                        <ul className="mt-2 font-mono space-y-2 text-[10px] leading-relaxed text-ink/75">
                                            {preflight.problems.map((problem) => (
                                                <li key={problem.id} className="flex gap-3">
                                                    <span className="select-none text-ink/40">—</span>
                                                    <span>{problem.detail}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {inAppBrowser && (
                                            <div className="mt-3 border-t border-ink/15 pt-3" data-testid="open-in-browser">
                                                <p className="font-mono text-[10px] leading-relaxed text-ink/75">
                                                    {welcome.openInBrowser.steps[platform]}
                                                </p>
                                                <button
                                                    type="button"
                                                    aria-label={welcome.openInBrowser.copyLinkAriaLabel}
                                                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-panel mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink/40 px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-ink transition-colors hover:bg-ink/10"
                                                    onClick={() => {
                                                        void handleCopyLink();
                                                    }}
                                                >
                                                    {welcome.openInBrowser.copyLink}
                                                </button>
                                                {copyState !== "idle" && (
                                                    <p
                                                        className="mt-2 font-mono text-[10px] leading-relaxed text-ink/75"
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

                                <div className="font-mono space-y-4 text-[12px] leading-relaxed text-ink/75">
                                    <p>{welcome.intro(variant)}</p>
                                    {welcome.steps.map((step) => (
                                        <p key={step}>{step}</p>
                                    ))}
                                </div>

                                <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-ink/70">
                                    {welcome.headphones}
                                </p>
                                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-ink/70">
                                    {preflight.orientationNeedsPermission
                                        ? welcome.accessWithRotation
                                        : welcome.accessAudioOnly}
                                </p>

                                {/*
                                  * The walk's one action, pinned to the bottom of the panel.
                                  *
                                  * Measured on BrowserStack real devices (rl-uo5): the panel's
                                  * content is 757pt on an iPhone 14 and 772pt on an iPhone SE,
                                  * against 663pt and 548pt of screen once Safari's toolbars are
                                  * drawn. The panel is simply taller than the phone, so no
                                  * min-height on its container can put START on the first screen
                                  * — the button was two thirds of a page down, and a walker who
                                  * did not think to scroll a screen that does not look scrollable
                                  * had no way in.
                                  *
                                  * sticky rather than fixed: it pins to the panel's own scrollport
                                  * (.modal-panel is the scroll container), so it sits inside the
                                  * rounded corners, and on a desktop — where the panel is shorter
                                  * than the window and nothing scrolls — it simply sits at the end
                                  * of the content, which is where it already was.
                                  *
                                  * The unlock error travels with it. It is what the button did,
                                  * and a sticky footer over the top of it would be the same
                                  * disappearing act one layer down.
                                  */}
                                <div className="sticky bottom-0 -mx-8 mt-8 bg-panel px-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
                                    <button
                                        type="button"
                                        // Not `disabled`: it would take the
                                        // control out from under a screen
                                        // reader mid-press. handleBegin turns
                                        // the second press away instead.
                                        aria-disabled={isBeginning}
                                        aria-busy={isBeginning}
                                        className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-panel inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-ink px-6 py-3 font-mono text-xs tracking-widest uppercase text-white transition-colors ${
                                            isBeginning
                                                ? "cursor-progress bg-edge"
                                                : "hover:bg-edge"
                                        }`}
                                        onClick={() => {
                                            void handleBegin();
                                        }}
                                        ref={cancelButtonRef}
                                    >
                                        {showStarting
                                            ? welcome.starting
                                            : preflight.verdict === "blocked"
                                                ? welcome.startAnyway
                                                : welcome.start}
                                    </button>

                                    {(lastUnlockError !== null || unlockFailed) && (
                                        <div className="mt-3" data-testid="unlock-error">
                                            <p className="font-mono text-[10px] uppercase tracking-widest text-status-error">
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
                                                    className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-[10px] text-status-error"
                                                    data-testid="unlock-error-detail"
                                                >
                                                    {lastUnlockError}
                                                </pre>
                                            )}
                                            {/*
                                              * Pressing Start again is the first thing to
                                              * try, so this sits under it and reads quieter.
                                              * A phone that will not unlock here sometimes
                                              * unlocks from the park's own start button, and
                                              * refusing to let them go and find out would
                                              * end the walk on the doorstep.
                                              */}
                                            <button
                                                type="button"
                                                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-panel mt-3 inline-flex min-h-[44px] items-center rounded-full px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink/60 underline decoration-ink/30 underline-offset-2 transition-colors hover:text-ink"
                                                data-testid="skip-unlock"
                                                onClick={() => {
                                                    setIsOpen(false);
                                                }}
                                            >
                                                {welcome.skipUnlock}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}

export default WelcomeModal;
