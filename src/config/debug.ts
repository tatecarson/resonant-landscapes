/**
 * Whether this page should expose its debug surfaces.
 *
 * Three things hang off this: the `window.__*Debug` mirrors the Playwright
 * specs read, the `/debug` route, and the `?mock=lat,lon` position spoof.
 * All three shipped unconditionally in the production bundle, which meant
 * anyone could fake their way into a park without walking to it, and every
 * frame wrote a debug object nobody was reading.
 *
 * Gating them on `import.meta.env.DEV` alone would have been simpler and
 * wrong: the mobile suites run against a public tunnel, and BrowserStack runs
 * can point at a deploy preview — a production build. Those specs read
 * `__audioDebug` 24 times and would have gone blind. So a production build can
 * still opt in explicitly, per page load, and says so in the URL.
 */
function hasDebugParam(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    const { search, hash } = window.location;
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";

    return (
        new URLSearchParams(search).has("debug") ||
        new URLSearchParams(hashQuery).has("debug")
    );
}

export function isDebugEnabled(): boolean {
    return import.meta.env.DEV || hasDebugParam();
}

/**
 * Chatter that helps while developing and is noise in production — including
 * one call that logged an entire AudioBuffer on every playback.
 *
 * console.error and console.warn are deliberately left alone: those fire when
 * something is actually wrong, and a walker's console is the only place a
 * field problem leaves a trace.
 */
export function debugLog(...args: unknown[]): void {
    if (isDebugEnabled()) {
        console.log(...args);
    }
}
