import { useEffect } from "react";

/**
 * Publish the visible area to CSS, measured rather than declared.
 *
 * The modals size themselves to the screen so their action stays on the first
 * one (rl-uo5), and they did that with `svh` — the smallest viewport, which is
 * defined as the size with the browser's UI fully shown. On BrowserStack's
 * iPhone 14 and SE, and in iOS 26 Safari, that unit is honest: 100svh equals
 * innerHeight equals the visible height, and the panels cap correctly.
 *
 * On a real hand-held iPhone it was not. START scrolled with the text instead
 * of staying pinned, which only happens when the panel never became a scroll
 * container — that is, when its max-height did not apply or applied a height
 * taller than the screen. A sticky footer inside a panel that does not scroll
 * has no scrollport to stick to, so it travels with the content and off the
 * bottom of the screen.
 *
 * So: stop asking the browser what a viewport unit means and read what it says
 * is visible right now. visualViewport is the one measurement that tracks the
 * toolbar as it collapses and re-expands, and it has been in every iOS Safari
 * since 13. Written to the root as custom properties, with an attribute that
 * says they are there — the attribute is what lets the CSS keep the svh ladder
 * as its fallback rather than depending on a var() fallback, which would take
 * the whole declaration down with it on a browser that has neither.
 *
 * Nothing here removes the properties on unmount. They describe the window,
 * not this component, and a modal closing does not make them wrong.
 */
export function useVisualViewport(): void {
    useEffect(() => {
        const root = document.documentElement;
        const viewport = window.visualViewport;

        const write = () => {
            // innerHeight as the floor: a browser without visualViewport still
            // gets a measured number rather than the declared unit.
            const height = viewport?.height ?? window.innerHeight;
            if (!height) return;

            /*
             * offsetTop is how far the visible area has been pushed down
             * inside the layout viewport — non-zero on iOS when the page is
             * pinch-zoomed or the toolbar is mid-collapse. The modal's
             * scrollport is placed with it, so `fixed inset-0` cannot leave
             * the panel sitting under the chrome.
             */
            root.style.setProperty("--visual-viewport-height", `${height}px`);
            root.style.setProperty("--visual-viewport-top", `${viewport?.offsetTop ?? 0}px`);
            root.setAttribute("data-viewport-measured", "");
        };

        write();

        // resize fires as the toolbar collapses and grows back; scroll fires
        // when the visible area moves within the layout viewport, which is the
        // case that leaves a fixed element off-screen on iOS.
        viewport?.addEventListener("resize", write);
        viewport?.addEventListener("scroll", write);
        window.addEventListener("resize", write);
        window.addEventListener("orientationchange", write);

        return () => {
            viewport?.removeEventListener("resize", write);
            viewport?.removeEventListener("scroll", write);
            window.removeEventListener("resize", write);
            window.removeEventListener("orientationchange", write);
        };
    }, []);
}
