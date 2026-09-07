import { useRef, Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useAudioEngine, useAudioPlaybackState } from '../contexts/AudioContextProvider';
import { help, install as installCopy } from '../copy';
import type { InstallOffer } from '../hooks/useInstallHint';
import { countEvent } from '../analytics/goatcounter';
import { useReduceVisualsPreference } from '../hooks/useReduceVisuals';

interface HelpModalProps {
    isOpen: boolean;
    setIsOpen: (value: boolean) => void;
    /**
     * The install affordance, captured from the page's earliest moments and
     * handed down from the map, which is always mounted when this guide
     * could possibly be open (rl-5yp).
     */
    install: InstallOffer["install"];
}

function HelpModal({ isOpen, setIsOpen, install }: HelpModalProps) {
    const cancelButtonRef = useRef(null);
    const { setKeepScreenAwake } = useAudioEngine();
    const {
        keepScreenAwake,
        wakeLockSupported,
        wakeLockStatus,
        wakeLockError,
    } = useAudioPlaybackState();
    const { reduceVisuals, followingSystem, setReduceVisuals } = useReduceVisualsPreference();

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
                    <div className="fixed inset-0 bg-ink/60 transition-opacity" />
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
                            <Dialog.Panel className="relative w-full rounded-2xl bg-panel p-8 shadow-2xl sm:my-8 sm:max-w-md">
                                {/* decorative top rule */}
                                <div className="mb-6 flex items-center gap-3">
                                    <div className="h-px flex-1 bg-ink/25" />
                                    <span className="text-xs text-ink/40 font-space-mono tracking-widest">✦</span>
                                    <div className="h-px flex-1 bg-ink/25" />
                                </div>

                                <Dialog.Title
                                    as="h2"
                                    className="font-cormorant text-5xl italic font-light tracking-tight text-ink mb-1"
                                >
                                    {help.title}
                                </Dialog.Title>
                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-ink/70 mb-7">
                                    {help.subtitle}
                                </p>

                                <ul className="font-space-mono space-y-3 text-[12px] leading-relaxed text-ink/75">
                                    {help.tips.map((tip) => (
                                        <li key={tip} className="flex gap-3">
                                            <span className="select-none text-ink/40">—</span>
                                            <span>{tip}</span>
                                        </li>
                                    ))}
                                    <li className="flex gap-3">
                                        <span className="select-none text-ink/40">—</span>
                                        <span>
                                            {help.questionsLabel}{' '}
                                            <a
                                                href={help.authorEmail}
                                                className="text-ink underline decoration-ink/40 underline-offset-2 transition-colors hover:decoration-ink"
                                            >
                                                {help.author}
                                            </a>
                                        </span>
                                    </li>
                                </ul>

                                <div className="mt-6 rounded-2xl border border-ink/15 bg-white/20 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-space-mono text-[11px] font-semibold uppercase tracking-wider text-ink">
                                                {help.keepAwake.title}
                                            </p>
                                            <p className="mt-1 font-space-mono text-[10px] leading-relaxed text-ink/70">
                                                {help.keepAwake.detail}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={wakeLockSupported && keepScreenAwake}
                                            aria-label={help.keepAwake.ariaLabel}
                                            disabled={!wakeLockSupported}
                                            onClick={() => setKeepScreenAwake(!keepScreenAwake)}
                                            className={`relative mt-0.5 inline-flex h-7 w-12 flex-none rounded-full border border-ink/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-panel ${
                                                keepScreenAwake && wakeLockSupported ? 'bg-ink' : 'bg-white/40'
                                            } ${wakeLockSupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                                        >
                                            <span
                                                className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-panel shadow transition-transform ${
                                                    keepScreenAwake && wakeLockSupported ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>
                                    <p className="mt-2 font-space-mono text-[9px] uppercase tracking-wider text-ink/55" aria-live="polite">
                                        {!wakeLockSupported
                                            ? help.keepAwake.unsupported
                                            : wakeLockError
                                                ? help.keepAwake.refused
                                                : wakeLockStatus === 'active'
                                                    ? help.keepAwake.active
                                                    : keepScreenAwake
                                                        ? help.keepAwake.armed
                                                        : help.keepAwake.off}
                                    </p>
                                </div>

                                {/*
                                  * Built as a sibling of the switch above, down
                                  * to the class list. Two preference controls in
                                  * one panel that looked different would read as
                                  * a bug rather than a pair.
                                  */}
                                <div className="mt-4 rounded-2xl border border-ink/15 bg-white/20 p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-space-mono text-[11px] font-semibold uppercase tracking-wider text-ink">
                                                {help.reduceVisuals.title}
                                            </p>
                                            <p className="mt-1 font-space-mono text-[10px] leading-relaxed text-ink/70">
                                                {help.reduceVisuals.detail}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={reduceVisuals}
                                            aria-label={help.reduceVisuals.ariaLabel}
                                            onClick={() => setReduceVisuals(!reduceVisuals)}
                                            className={`relative mt-0.5 inline-flex h-7 w-12 flex-none cursor-pointer rounded-full border border-ink/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-panel ${
                                                reduceVisuals ? 'bg-ink' : 'bg-white/40'
                                            }`}
                                        >
                                            <span
                                                className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-panel shadow transition-transform ${
                                                    reduceVisuals ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </div>
                                    {/*
                                      * The preference has three states and a
                                      * switch shows two, so the switch reflects
                                      * what is actually happening and this line
                                      * says where that came from. Without it the
                                      * control looks untouched while the phone
                                      * is quietly deciding.
                                      */}
                                    <p className="mt-2 font-space-mono text-[9px] uppercase tracking-wider text-ink/55" aria-live="polite">
                                        {followingSystem
                                            ? help.reduceVisuals.followingSystem
                                            : reduceVisuals
                                                ? help.reduceVisuals.on
                                                : help.reduceVisuals.off}
                                    </p>
                                </div>

                                {/*
                                  * The install affordance, the only one (rl-5yp).
                                  * The popup over the map is gone by decision:
                                  * an interruption asking for something is the
                                  * opposite of a piece about wandering. Prose
                                  * for every phone, because iOS cannot be
                                  * asked to install from a button; the button
                                  * appears only where the browser will do it
                                  * on request, and once used — either way — it
                                  * does not come back this session.
                                  */}
                                <div className="mt-6 rounded-2xl bg-white/25 p-4" data-testid="help-install">
                                    <p className="font-space-mono text-[11px] uppercase tracking-[0.16em] text-ink/85">
                                        {installCopy.helpTitle}
                                    </p>
                                    <p className="mt-2 font-space-mono text-[12px] leading-relaxed text-ink/75">
                                        {installCopy.helpDetail}
                                    </p>
                                    {install && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                countEvent("install-prompt");
                                                void install();
                                            }}
                                            className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-ink px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-edge"
                                        >
                                            {installCopy.action}
                                        </button>
                                    )}
                                </div>

                                <div className="mt-8 mb-6 flex items-center gap-3">
                                    <div className="h-px flex-1 bg-ink/25" />
                                    <span className="text-xs text-ink/40 font-space-mono tracking-widest">✦</span>
                                    <div className="h-px flex-1 bg-ink/25" />
                                </div>

                                <p className="font-space-mono text-[10px] tracking-widest uppercase text-ink/70 mb-3">
                                    {help.aboutLabel}
                                </p>
                                <div className="font-space-mono space-y-3 text-[12px] leading-relaxed text-ink/75">
                                    <p>
                                        {help.credits}
                                    </p>
                                    <p>
                                        <a
                                            href={help.paperUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={help.paperAriaLabel}
                                            className="text-ink underline decoration-ink/40 underline-offset-2 transition-colors hover:decoration-ink"
                                        >
                                            {help.paperLabel} <span aria-hidden="true">↗</span>
                                        </a>
                                    </p>
                                    <p>
                                        <a
                                            href={help.projectUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={help.projectAriaLabel}
                                            className="text-ink underline decoration-ink/40 underline-offset-2 transition-colors hover:decoration-ink"
                                        >
                                            {help.projectLabel} <span aria-hidden="true">↗</span>
                                        </a>
                                    </p>
                                </div>

                                <div className="mt-8">
                                    <button
                                        type="button"
                                        className="w-full rounded-full bg-ink px-6 py-3 font-space-mono text-xs tracking-widest uppercase text-white transition-colors hover:bg-edge"
                                        onClick={() => setIsOpen(false)}
                                        ref={cancelButtonRef}
                                    >
                                        {help.close}
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
