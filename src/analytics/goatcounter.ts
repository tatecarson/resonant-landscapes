/**
 * Visitor counts for the run of the installation (rl-lfk).
 *
 * GoatCounter, chosen against the constraints Tate set: free for
 * non-commercial use, cookieless, no fingerprinting, no consent banner, and
 * not Google. What is sent is a path, a rough screen size and a referrer —
 * the kind of thing that could be read aloud on a placard. Nothing is stored
 * on the walker's phone, so there is nothing to opt out of; the visitor-facing
 * experience does not change.
 *
 * Off by default. The counting script loads only when VITE_GOATCOUNTER_SITE
 * is set at build time (Tate's GoatCounter site code, set in the Netlify build
 * environment), so tests, deploy previews and a developer's laptop send
 * nothing at all.
 *
 * A decision recorded here, from the issue: pings that fail are not retried
 * and nothing is queued between sessions. A walker out of signal is not
 * counted, and the numbers are honest about that — buffering identities or
 * events across offline walks to repair the count would be exactly the kind
 * of invasiveness this was asked not to have.
 *
 * count.js counts a pageview when it loads. The walk is a single page with
 * no routing, so that pageview is the visit; everything else is counted here
 * as events (walk-started, park-heard, install-prompt).
 */
const SITE_CODE: string | undefined = import.meta.env.VITE_GOATCOUNTER_SITE;
const SCRIPT_URL = "https://gc.zgo.at/count.js";

type CountOptions = { path: string; event: boolean };

let injected = false;
const pending: CountOptions[] = [];
const countedOnce = new Set<string>();

function enabled(): boolean {
    return Boolean(SITE_CODE) && typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * The full counting URL, `/count` included. count.js uses this verbatim and
 * appends only a query string, so without the path every ping goes to the
 * dashboard page instead — which answers a redirect that sendBeacon reports as
 * success, so nothing counted and nothing complained.
 */
function endpoint(): string {
    return `https://${SITE_CODE}.goatcounter.com/count`;
}

function count(options: CountOptions): void {
    const goatcounter = window.goatcounter;
    if (goatcounter) {
        goatcounter.count({ path: options.path, event: options.event });
        return;
    }
    // The script loads async and an event can be worth counting before it
    // arrives. Held here, flushed on load — and dropped if load never
    // happens, per the decision above.
    pending.push(options);
}

/** Load the counting script, which counts the visit itself. */
export function initGoatCounter(): void {
    if (!enabled() || injected) return;
    injected = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = SCRIPT_URL;
    script.dataset.goatcounter = endpoint();
    script.onload = () => {
        for (const options of pending.splice(0)) {
            count(options);
        }
    };
    document.head.appendChild(script);
}

/**
 * One event, once per page load. For things that are facts about this visit
 * rather than occurrences in it: the walk starting, the guide's install
 * button being used. A walker who leaves and re-enters a park is still one
 * walker who started a walk.
 */
export function countEventOnce(name: string): void {
    if (countedOnce.has(name)) return;
    countedOnce.add(name);
    countEvent(name);
}

/** One event, every time it happens. For parks heard, which repeat honestly. */
export function countEvent(name: string): void {
    if (!enabled() || !injected) return;
    count({ path: name, event: true });
}
