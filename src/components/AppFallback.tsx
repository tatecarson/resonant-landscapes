import type { ReactNode } from "react";

/**
 * One plain sentence, centred, for the two moments the walk has nothing else
 * to show: a lazy chunk still arriving, and an error boundary that caught
 * something below it.
 *
 * Both of these used to render a bare <div>Error</div>. That is the same
 * fault as the raw exception WelcomeModal printed: a word the walker cannot
 * act on, at the moment they most need to be told what to do.
 */
function AppFallback({ children }: { children: ReactNode }) {
    return (
        <div
            role="status"
            className="flex min-h-screen items-center justify-center bg-[#8ecdc0] p-8"
            data-testid="app-fallback"
        >
            <p className="max-w-xs text-center font-space-mono text-[12px] leading-relaxed text-neutral-900/80">
                {children}
            </p>
        </div>
    );
}

export default AppFallback;
