import { memo } from "react";

import { useInstallHint } from "../hooks/useInstallHint";
import { install as installCopy } from "../copy";

interface InstallHintProps {
    /**
     * False while a park strip or the field guide is up. It shares the bottom
     * of the display with the nearest-park chip and, like the chip, must not
     * float over a modal's controls: that is rl-1u7.15, and this is the new
     * overlay that issue warned about.
     */
    active: boolean;
}

/**
 * Offered once, after the walker has heard a park.
 *
 * Interactive, unlike the offline notice, so it has to stand down rather than
 * merely stop taking taps. Dismissing is remembered: an offer refused is
 * answered, and asking again is how a hint becomes a nag.
 */
function InstallHint({ active }: InstallHintProps) {
    const { show, platform, install, dismiss } = useInstallHint();

    if (!active || !show) return null;

    return (
        <div
            className="pointer-events-auto flex max-w-sm flex-col gap-2 rounded-2xl bg-panel px-4 py-3 shadow-notice"
            data-testid="install-hint"
        >
            <div className="flex flex-col gap-2">
                <p className="font-space-mono text-[11px] uppercase tracking-[0.16em] text-ink/85">
                    {installCopy.title}
                </p>
                <p className="font-space-mono text-[11px] leading-relaxed text-ink/70">
                    {installCopy.detail[platform]}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    {/*
                      * Only where the browser will actually install on
                      * request. On iOS there is no such API, so offering a
                      * button that cannot do anything would be worse than the
                      * instructions above it.
                      */}
                    {install && (
                        <button
                            type="button"
                            onClick={() => void install()}
                            className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-white transition-colors hover:bg-edge"
                        >
                            {installCopy.action}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={dismiss}
                        className="inline-flex min-h-[44px] items-center rounded-full border border-ink/30 px-4 py-2 font-space-mono text-xs uppercase tracking-widest text-ink/80 transition-colors hover:border-ink"
                    >
                        {installCopy.dismiss}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default memo(InstallHint);
