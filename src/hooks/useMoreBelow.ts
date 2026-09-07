import { useEffect, useState } from "react";

/**
 * Whether a scroll container is holding something back, and whether it can
 * scroll at all.
 *
 * The modals cap their panel at the height of the screen (rl-uo5), which put
 * the START button back on the first screen and moved the rest of the text
 * below a fold. On an iPhone SE that is 41% of the panel — three of the four
 * walk instructions, the headphones line, and the line about the sound
 * permission — and a phone draws no scrollbar to say so.
 *
 * The fade over the last visible line is not enough on its own. It only reads
 * as "more text" when it lands *on* a line, and on the SE it lands in the gap
 * between two paragraphs: nothing is cut, so nothing looks continued. Hence a
 * cue that does not depend on where the fold happens to fall.
 *
 * Two booleans rather than one, because they answer different questions.
 * `canScroll` decides whether to reserve the cue's space at all, so a desktop
 * panel that fits does not carry a gap for a hint it will never show, and
 * `moreBelow` fades the cue out at the end without the button moving under
 * the reader's thumb.
 *
 * A callback ref, not useRef: the panel mounts and unmounts with the dialog's
 * transition, and a ref object would not tell this hook when that happened.
 */
export function useMoreBelow<T extends HTMLElement>(): {
    ref: (node: T | null) => void;
    canScroll: boolean;
    moreBelow: boolean;
} {
    const [node, setNode] = useState<T | null>(null);
    const [state, setState] = useState({ canScroll: false, moreBelow: false });

    useEffect(() => {
        if (!node) {
            setState({ canScroll: false, moreBelow: false });
            return;
        }

        const read = () => {
            // A pixel of slack at both ends. Fractional layout means a panel
            // scrolled fully to the bottom lands a hair short of its own
            // scrollHeight, and a panel that fits exactly can be a hair over.
            const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
            setState({
                canScroll: node.scrollHeight - node.clientHeight > 1,
                moreBelow: remaining > 1,
            });
        };

        read();
        node.addEventListener("scroll", read, { passive: true });

        /*
         * The first read runs before the display face has loaded, and the
         * title is 5xl: the panel's content grows under it, which is exactly
         * the case where the answer flips from "everything fits" to "there is
         * more below". Observing the panel alone would not catch that — a
         * scroll container's own box does not change when its content grows —
         * so the children are observed too.
         *
         * Children present at mount, deliberately. The one block that appears
         * later is the unlock error, which only renders after START has been
         * pressed, by which point the walker is leaving this screen rather
         * than reading it.
         */
        const observer =
            typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
        if (observer) {
            observer.observe(node);
            for (const child of Array.from(node.children)) observer.observe(child);
        }

        return () => {
            node.removeEventListener("scroll", read);
            observer?.disconnect();
        };
    }, [node]);

    return { ref: setNode, ...state };
}
