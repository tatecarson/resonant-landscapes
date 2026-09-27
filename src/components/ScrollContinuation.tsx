import type { MouseEvent } from "react";
import { modal } from "../copy";

interface ScrollContinuationProps {
    canScroll: boolean;
    moreBelow: boolean;
}

/** A visible way into text hidden behind a modal's sticky action. */
export function ScrollContinuation({ canScroll, moreBelow }: ScrollContinuationProps) {
    if (!canScroll) return null;

    const scrollToMore = (event: MouseEvent<HTMLButtonElement>) => {
        const panel = event.currentTarget.closest<HTMLElement>(".modal-panel");
        if (!panel) return;

        panel.scrollBy({
            top: panel.clientHeight * 0.7,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
        });
    };

    return (
        <button
            type="button"
            disabled={!moreBelow}
            aria-hidden={!moreBelow}
            onClick={scrollToMore}
            className={`mx-auto mb-2 flex min-h-[36px] items-center justify-center gap-2 rounded-full px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink underline decoration-ink/50 underline-offset-4 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                moreBelow ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
        >
            {modal.continueReading} <span aria-hidden="true" className="text-base leading-none">↓</span>
        </button>
    );
}
