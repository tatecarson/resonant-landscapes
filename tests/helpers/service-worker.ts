/**
 * Whether a service worker is standing between this test and the network.
 *
 * A production build registers one, and on WebKit Playwright cannot intercept
 * service-worker-initiated requests. Any spec that measures the network
 * through `context.route` is then writing fiction: the recorder counts
 * nothing, per-request delays never apply, and the payload arrives at real
 * speed while the assertions believe they are watching a throttled transfer.
 * Tracked as rl-9ek.1; until the measurement moves to a layer the worker
 * cannot bypass, such a run is skipped rather than green for no reason.
 *
 * Two checks, because one is not enough. The worker cannot be seen before the
 * page loads, and it claims the page asynchronously — `clientsClaim` can land
 * after any grace period you pick. So ask once up front to skip cheaply, and
 * ask again by the only question that cannot be raced: did the recorder
 * actually see anything? A worker that claimed at second four leaves the same
 * empty recorder as one that claimed at second one.
 */
import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

export const WORKER_HIDES_ROUTING =
    "the service worker mediates audio fetches and WebKit routing cannot see them (rl-9ek.1)";

/**
 * Skip early when the worker has already claimed the page. Call after goto.
 *
 * The grace period is for the common case where registration is a moment
 * behind the load; it is not a guarantee, which is what
 * `skipIfRoutingSawNothing` is for.
 */
export async function skipIfWorkerControlsPage(page: Page, browserName: string) {
    const controlled = await page
        .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 3_000 })
        .then(() => true)
        .catch(() => false);

    if (browserName === "webkit" && controlled) {
        test.skip(true, WORKER_HIDES_ROUTING);
    }
}

/**
 * Skip late when the recorder is empty. Call before asserting on it.
 *
 * On WebKit an empty recorder after a park has demonstrably loaded means the
 * requests went somewhere this test cannot see — a worker that claimed the
 * page after the early check. Skipping says that plainly. Asserting instead
 * would report a product failure for a walk that played fine, which is the
 * whole complaint rl-9ek exists to answer.
 */
export function skipIfRoutingSawNothing(routedRequestCount: number, browserName: string) {
    if (browserName === "webkit" && routedRequestCount === 0) {
        test.skip(true, WORKER_HIDES_ROUTING);
    }
}
