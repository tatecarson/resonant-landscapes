import { getParkAudioVariants, type AudioVariant } from "../utils/audioPaths";
import stateParks from "../data/stateParks.json";

/**
 * The disk half of cache-on-use: park audio the walk has already fetched is
 * kept in Cache Storage so an offline visit can replay what it holds rather
 * than drawing a new recording it cannot download.
 *
 * Three decisions shape everything below, all inherited from the issue:
 *
 * Cache on use, not cache ahead. There is no stable per-park recording to
 * precache against — the variant seed is deliberately session-only, so the
 * recording a visit draws changes — and any offline design that assumed one
 * would design away the variety that is the piece. So bytes are written here
 * as they come through the fetch seam, and never fetched *for* the cache.
 *
 * Network-first, cache on failure. Online behaviour is byte-identical to a
 * walk without this module: the CDN is still asked first, every time. The
 * cache answers only when the network does not, which keeps a CDN file
 * replaced in place from being served stale, and keeps the offline path a
 * fallback rather than a second behaviour to reason about.
 *
 * Encoded files, never decoded buffers. The merged park buffer is ~100 MB
 * per minute of float PCM and dies with the page; what goes to disk is the
 * two encoded files behind it, measured at ~10 MB per park on the AAC family
 * and ~14 MB on the lossless one (Hartford Beach rec 1 sec 1, 2026-09-03).
 */

const AUDIO_CACHE_NAME = "resonant-audio-v1";
const INDEX_STORAGE_KEY = "resonantAudioCacheIndex";
const BYTE_BUDGET = 150 * 1024 * 1024;
/**
 * The budget the eviction policy actually enforces. BYTE_BUDGET outside a
 * test; a test that wants to see the sweep without writing 150 MB shrinks it.
 */
let byteBudget = BYTE_BUDGET;

/** Test seam. The real walk never calls this. */
export function setByteBudgetForTests(bytes: number) {
    byteBudget = bytes;
}
/**
 * For the odd response with no Content-Length to read. Sits between the two
 * measured families so a cache full of real files is neither wildly
 * over- nor under-counted.
 */
const PAIR_BYTE_ESTIMATE = 12 * 1024 * 1024;
/** Half a pair: what one URL costs when its own size never arrived. */
const URL_BYTE_ESTIMATE = PAIR_BYTE_ESTIMATE / 2;

/**
 * What the fetch seam reports, so the provider can mirror cache behaviour
 * into the debug bridge and the tests can see which path served the bytes.
 */
export interface AudioBytesResult {
    bytes: ArrayBuffer;
    fromCache: boolean;
}

/** Debug events the provider maps onto the audio debug bridge. */
export type OfflineCacheEvent =
    | { kind: "cache-write"; url: string }
    | { kind: "cache-write-failed"; url: string; error: string }
    | { kind: "cache-hit"; url: string }
    | { kind: "cache-evicted"; urls: string[] };

type EventSink = (event: OfflineCacheEvent) => void;
let eventSink: EventSink | null = null;

/** The provider injects a sink so cache activity reaches window.__audioDebug. */
export function setOfflineCacheEventSink(sink: EventSink | null) {
    eventSink = sink;
}

function emit(event: OfflineCacheEvent) {
    try {
        eventSink?.(event);
    } catch {
        // A debug sink that throws must never take the fetch path down.
    }
}

function openAudioCache(): Promise<Cache> {
    return caches.open(AUDIO_CACHE_NAME);
}

/**
 * One URL touched by the seam, with what the eviction policy needs to know.
 * A pair (spatial + mono) is derived from these on demand; a park is
 * "cached" when at least one of its pairs is complete.
 */
interface UrlRecord {
    bytes: number;
    touchedAt: number;
}

type UrlIndex = Record<string, UrlRecord>;

function readIndex(): UrlIndex {
    try {
        const raw = window.localStorage.getItem(INDEX_STORAGE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const index: UrlIndex = {};
        for (const [url, record] of Object.entries(parsed as Record<string, unknown>)) {
            if (
                typeof url === "string" &&
                record && typeof record === "object" &&
                typeof (record as UrlRecord).bytes === "number" &&
                typeof (record as UrlRecord).touchedAt === "number"
            ) {
                index[url] = record as UrlRecord;
            }
        }
        return index;
    } catch {
        // Blocked storage, junk, or a private window: the cache still works,
        // it just evicts blind. Same trade as the heard-parks store.
        return {};
    }
}

function writeIndex(index: UrlIndex) {
    try {
        window.localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(index));
    } catch {
        // Quota refused the index, not the audio. Eviction degrades to
        // inserting rather than ordering; nothing here is worth a throw.
    }
}

let persistRequested = false;

/**
 * Best-effort durability. Without this, Chrome holds the cache on a
 * best-effort basis and may clear it under disk pressure, which is exactly
 * the visit the cache exists for. Safari ignores it, which is fine: there
 * the promise is advisory either way.
 */
function requestStoragePersistenceOnce() {
    if (persistRequested) return;
    persistRequested = true;
    try {
        void navigator.storage?.persist?.().catch(() => {
            // Refusal changes nothing about this walk.
        });
    } catch {
        // No storage manager (old engines): the cache still works.
    }
}

/** Cached park audio is per-park-name, so a park heard at one site is held at every site. */
let parkUrlIndex: Map<string, AudioVariant[]> | null = null;

function parkVariants(parkName: string): AudioVariant[] {
    // Both families, because a park can be cached from whichever browser
    // heard it. The family the current session would draw comes back
    // alongside the other one and both are legitimate things to replay.
    const families = ["Chrome", ""] as const;
    const variants: AudioVariant[] = [];
    for (const userAgent of families) {
        for (const variant of getParkAudioVariants(parkName, stateParks, userAgent) ?? []) {
            variants.push(variant);
        }
    }
    return variants;
}

function buildParkUrlIndex(): Map<string, AudioVariant[]> {
    if (parkUrlIndex) return parkUrlIndex;
    parkUrlIndex = new Map();
    for (const park of stateParks) {
        const variants = parkVariants(park.name);
        if (variants.length > 0) {
            parkUrlIndex.set(park.name, variants);
        }
    }
    return parkUrlIndex;
}

/**
 * Which park a fetched URL belongs to, and which pair of URLs is its
 * variant. URLs the walk never builds this way — the debug parks, mostly —
 * come back null. They are still cached, indexed and evictable (a debug
 * pair is ~47 MB of WAV and should go when the budget says so), they just
 * never count as a park being held, because no park is known for them.
 */
export function resolveAudioUrl(url: string): { parkName: string; variant: AudioVariant } | null {
    for (const [parkName, variants] of buildParkUrlIndex()) {
        for (const variant of variants) {
            if (variant.includes(url)) {
                return { parkName, variant };
            }
        }
    }
    return null;
}

function pairUrls(url: string): string[] {
    return resolveAudioUrl(url)?.variant ?? [url];
}

/**
 * What one indexed URL costs the budget. A response that arrived with no
 * usable Content-Length is charged the estimate rather than nothing: charging
 * zero would let a cache full of unmeasured files sum to zero and never cross
 * the budget at all, which is the one direction the accounting must not fail
 * in. Every place the running total is added to or subtracted from goes
 * through here, so an entry always leaves at exactly the weight it arrived.
 */
function chargedBytes(record: UrlRecord | undefined): number {
    if (!record) return 0;
    return record.bytes > 0 ? record.bytes : URL_BYTE_ESTIMATE;
}

function pairBytes(index: UrlIndex, urls: string[]): number {
    let total = 0;
    let missing = false;
    for (const url of urls) {
        const record = index[url];
        if (!record) {
            missing = true;
            continue;
        }
        total += record.bytes > 0 ? record.bytes : 0;
        if (record.bytes <= 0) missing = true;
    }
    // A pair with unknown sizes counts at the estimate rather than at zero,
    // so accounting holes bias towards evicting, never towards hoarding.
    return missing ? Math.max(total, PAIR_BYTE_ESTIMATE) : total;
}

/**
 * Half-fetched pairs first, then the complete pairs the walker has not
 * touched for the longest, until the byte budget holds. A half pair can
 * never play — playback needs both files — so it is dead weight whatever
 * its age. Completeness is tested against the pair the URL resolves to,
 * never against the indexed members alone, which would make any half pair
 * complete by construction.
 *
 * Deleting from the cache is the truth; the index only decides the order.
 */
function evictToBudget() {
    const index = readIndex();
    let total = Object.values(index).reduce((sum, record) => sum + chargedBytes(record), 0);
    if (total <= byteBudget) return;

    const groups = new Map<string, { pair: string[]; members: string[] }>();
    for (const url of Object.keys(index)) {
        const pair = pairUrls(url);
        const groupKey = [...pair].sort().join("::");
        const group = groups.get(groupKey) ?? { pair, members: [] };
        group.members.push(url);
        groups.set(groupKey, group);
    }

    const complete: Array<{ urls: string[]; bytes: number; touchedAt: number }> = [];
    const orphans: string[] = [];
    for (const group of groups.values()) {
        if (group.pair.every((url) => index[url])) {
            const urls = [...group.pair].sort();
            complete.push({ urls, bytes: pairBytes(index, urls), touchedAt: Math.min(...urls.map((url) => index[url].touchedAt)) });
        } else {
            orphans.push(...group.members);
        }
    }

    const evictUrls = async (urls: string[]) => {
        try {
            const cache = await openAudioCache();
            await Promise.all(urls.map((url) => cache.delete(url)));
        } catch {
            // A cache that cannot delete keeps bytes the index has already
            // forgotten. reconcileIndexWithCache adopts them back on the next
            // session's first write, which is what makes them evictable again.
        }
        emit({ kind: "cache-evicted", urls });
    };

    const sweep = (urls: string[]) => {
        for (const url of urls) {
            total -= chargedBytes(index[url]);
            delete index[url];
        }
    };

    const deletions: Promise<void>[] = [];
    if (orphans.length > 0) {
        const orphanUrls = [...orphans].sort((a, b) => index[a].touchedAt - index[b].touchedAt);
        while (total > byteBudget && orphanUrls.length > 0) {
            const url = orphanUrls.shift()!;
            deletions.push(evictUrls([url]));
            sweep([url]);
        }
    }
    complete.sort((a, b) => a.touchedAt - b.touchedAt);
    while (total > byteBudget && complete.length > 0) {
        const entry = complete.shift()!;
        deletions.push(evictUrls(entry.urls));
        sweep(entry.urls);
    }

    writeIndex(index);
    void Promise.all(deletions).then(() => scheduleCachedParksRecompute());
}

let indexReconciled = false;

/**
 * Put the index back in step with what Cache Storage actually holds.
 *
 * The index is the only thing eviction can see, and it can lose entries the
 * cache still has: a `writeIndex` that quota refused, a `cache.delete` that
 * threw after the entry was already swept. Bytes in that state are invisible
 * to the budget forever — they are never counted and never deleted — which is
 * exactly the unbounded growth the budget exists to prevent, and
 * `navigator.storage.persist()` has already asked the browser not to reclaim
 * them for us. So a URL on disk the index does not know is adopted at the
 * estimate and dated to the epoch, which makes it the first thing evicted;
 * an index entry with nothing behind it is dropped, so it stops charging the
 * budget for bytes that are gone.
 *
 * Once per session, before the first eviction decision. The reconcile is a
 * full `cache.keys()` scan, and nothing between two writes can desynchronise
 * the index badly enough to be worth paying that on every one.
 */
async function reconcileIndexWithCache() {
    try {
        const cache = await openAudioCache();
        const heldUrls = new Set((await cache.keys()).map((request) => request.url));
        const index = readIndex();
        let changed = false;

        for (const url of heldUrls) {
            if (!index[url]) {
                index[url] = { bytes: 0, touchedAt: 0 };
                changed = true;
            }
        }
        for (const url of Object.keys(index)) {
            if (!heldUrls.has(url)) {
                delete index[url];
                changed = true;
            }
        }

        if (changed) writeIndex(index);
    } catch {
        // No Cache Storage to reconcile against: the index stands as it is,
        // which is the same position this module was in before the scan.
    }
}

async function writeThrough(url: string, response: Response) {
    try {
        const cache = await openAudioCache();
        await cache.put(url, response);
        requestStoragePersistenceOnce();

        const index = readIndex();
        const length = Number(response.headers.get("content-length"));
        index[url] = {
            bytes: Number.isFinite(length) && length > 0 ? length : 0,
            touchedAt: Date.now(),
        };
        writeIndex(index);
        emit({ kind: "cache-write", url });

        if (!indexReconciled) {
            indexReconciled = true;
            await reconcileIndexWithCache();
        }
        evictToBudget();
        scheduleCachedParksRecompute();
    } catch (error) {
        // Quota, private mode, or a storage system that refuses writes: the
        // walk plays exactly as it did before this module existed. A cache
        // that fills up must never break a walk that would have worked.
        emit({ kind: "cache-write-failed", url, error: error instanceof Error ? error.message : String(error) });
    }
}

async function readCached(url: string): Promise<ArrayBuffer | null> {
    try {
        const cache = await openAudioCache();
        const cached = await cache.match(url);
        if (!cached) return null;
        const bytes = await cached.arrayBuffer();

        const index = readIndex();
        if (index[url]) {
            index[url] = { ...index[url], touchedAt: Date.now() };
            writeIndex(index);
        }
        emit({ kind: "cache-hit", url });
        return bytes;
    } catch {
        return null;
    }
}

/**
 * The fetch seam, network-first with the cache as its fallback.
 *
 * The signal is respected the way the loader expects: an aborted load throws,
 * cache or no cache, and a response that arrived whole for a load that was
 * then abandoned is still worth keeping — the bytes cost the same either way,
 * and the park they belong to is usually the one being walked towards.
 *
 * An abort must never be answered from disk. The loader only checks the
 * signal after decoding, so resolving a cancelled prefetch with held bytes
 * would spend a full 8-channel decode on a park the walker has already walked
 * past — the exact cost the abort was raised to avoid.
 */
export async function fetchAudioBytes(url: string, signal: AbortSignal): Promise<AudioBytesResult> {
    let response: Response;
    try {
        response = await fetch(url, { signal });
    } catch (error) {
        if (signal.aborted) throw error;
        const cached = await readCached(url);
        if (cached) return { bytes: cached, fromCache: true };
        throw error;
    }

    if (!response.ok) {
        const cached = await readCached(url);
        if (cached) return { bytes: cached, fromCache: true };
        throw new Error(`Failed to fetch ${url} (${response.status})`);
    }

    // Clone while the body is still readable — a clone taken after the
    // arrayBuffer lands is an empty shell. Keep a response that arrived
    // whole even if the load was abandoned after it did: the bytes cost the
    // same either way, and the park they belong to is usually the one being
    // walked towards. A fetch that threw mid-flight never reaches this line.
    const saved = signal.aborted ? null : response.clone();
    let bytes: ArrayBuffer;
    try {
        bytes = await response.arrayBuffer();
    } catch (error) {
        // The body died part-way down: signal lost mid-download, which is the
        // thin-signal case this cache is for. Same fallback as a fetch that
        // never connected — and the clone is cancelled rather than left
        // holding a locked stream over the half of the park that did arrive.
        void saved?.body?.cancel().catch(() => {});
        if (signal.aborted) throw error;
        const cached = await readCached(url);
        if (cached) return { bytes: cached, fromCache: true };
        throw error;
    }
    if (saved) {
        void writeThrough(url, saved);
    }
    return { bytes, fromCache: false };
}

/**
 * A variant of the named park whose both files the cache holds, most
 * recently used first. This is what an offline replay is allowed to
 * substitute: not a new recording drawn from the seed, but one the walk
 * already paid for.
 */
export async function findCachedVariantForPark(parkName: string): Promise<AudioVariant | null> {
    try {
        const cache = await openAudioCache();
        const heldUrls = new Set((await cache.keys()).map((request) => request.url));
        const index = readIndex();

        const variants = parkVariants(parkName);
        let best: { variant: AudioVariant; touchedAt: number } | null = null;
        for (const variant of variants) {
            if (!variant.every((url) => heldUrls.has(url))) continue;
            const touchedAt = Math.min(...variant.map((url) => index[url]?.touchedAt ?? 0));
            if (!best || touchedAt > best.touchedAt) {
                best = { variant, touchedAt };
            }
        }
        return best?.variant ?? null;
    } catch {
        return null;
    }
}

/**
 * Which parks the cache actually holds, straight from Cache Storage rather
 * than from the byte index — the index advises eviction, the cache is the
 * truth a walker is standing on.
 *
 * Cached is not heard, and the difference matters: a prefetch can complete
 * for a park the walker never enters, and an eviction can take a park the
 * heard record still counts. This store answers only "will this park play
 * with no signal".
 */
let cachedParksSnapshot: ReadonlySet<string> = new Set();
const cachedParksListeners = new Set<() => void>();
let recomputeInFlight: Promise<void> | null = null;
let recomputeScheduled = false;

function notifyCachedParksChanged() {
    for (const listener of cachedParksListeners) {
        listener();
    }
}

export function subscribeToCachedParks(listener: () => void): () => void {
    cachedParksListeners.add(listener);
    if (cachedParksListeners.size === 1) {
        void recomputeCachedParks();
    }
    return () => {
        cachedParksListeners.delete(listener);
    };
}

export function getCachedParksSnapshot(): ReadonlySet<string> {
    return cachedParksSnapshot;
}

export function recomputeCachedParks(): Promise<void> {
    if (recomputeInFlight) return recomputeInFlight;
    recomputeInFlight = (async () => {
        try {
            const cache = await openAudioCache();
            const heldUrls = new Set((await cache.keys()).map((request) => request.url));
            const held: string[] = [];
            for (const [parkName, variants] of buildParkUrlIndex()) {
                if (variants.some((variant) => variant.every((url) => heldUrls.has(url)))) {
                    held.push(parkName);
                }
            }
            const next = new Set(held);
            const changed = next.size !== cachedParksSnapshot.size
                || [...next].some((parkName) => !cachedParksSnapshot.has(parkName));
            // Only swap the object when the set really changed.
            // useSyncExternalStore compares snapshots by identity, so a fresh
            // Set holding the same parks is still a change to React: every
            // park marker would re-render for a recompute that found nothing.
            if (changed) {
                cachedParksSnapshot = next;
                notifyCachedParksChanged();
            }
        } catch {
            // No Cache Storage (private window, old engine): nothing is
            // held, which is the honest answer. Already-empty stays the same
            // object, for the same identity reason as above.
            if (cachedParksSnapshot.size > 0) {
                cachedParksSnapshot = new Set();
                notifyCachedParksChanged();
            }
        } finally {
            recomputeInFlight = null;
        }
    })();
    return recomputeInFlight;
}

/**
 * Writes and evictions come in bursts of two (a pair), and Cache Storage
 * round-trips are not free on a phone. Coalesce.
 */
export function scheduleCachedParksRecompute() {
    if (recomputeScheduled || typeof window === "undefined") return;
    recomputeScheduled = true;
    window.setTimeout(() => {
        recomputeScheduled = false;
        void recomputeCachedParks();
    }, 500);
}
