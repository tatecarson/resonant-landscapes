/**
 * Tests for the disk half of cache-on-use.
 *
 * The Cache API, fetch and localStorage are all stubbed: vitest runs in
 * node, and the behaviour under test is the policy — network first, write
 * through on success, fall back on failure, evict oldest pairs when the
 * measured byte budget is exceeded — not any browser's storage internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getParkAudioVariants } from "../utils/audioPaths";

type LoadOfflineCache = typeof import("./offlineAudioCache");

const HARTFORD = "Hartford Beach State Park";

function makeFakeStorage() {
    const backing = new Map<string, string>();
    return {
        getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
        setItem: (key: string, value: string) => void backing.set(key, value),
        removeItem: (key: string) => void backing.delete(key),
    };
}

function makeFakeCaches() {
    const stores = new Map<string, Map<string, Response>>();
    return {
        stores,
        open: vi.fn(async (name: string) => {
            const store = stores.get(name) ?? new Map<string, Response>();
            stores.set(name, store);
            return {
                put: async (url: string, response: Response) => void store.set(url, response),
                match: async (url: string) => store.get(url) ?? null,
                keys: async () => [...store.keys()].map((url) => new Request(url)),
                delete: async (url: string) => store.delete(url),
            };
        }),
    };
}

interface Harness {
    offlineCache: LoadOfflineCache;
    caches: ReturnType<typeof makeFakeCaches>;
    fetchMock: ReturnType<typeof vi.fn>;
    storage: ReturnType<typeof makeFakeStorage>;
}

/**
 * Fresh module state per test: the park URL index, the cached-parks
 * snapshot and the event sink are module-level, so every test re-imports.
 */
async function loadHarness(fetchImpl?: (url: string) => Promise<Response>): Promise<Harness> {
    vi.resetModules();
    const caches = makeFakeCaches();
    const storage = makeFakeStorage();
    const fetchMock = vi.fn(fetchImpl ?? (async () => new Response(new ArrayBuffer(0), { status: 500 })));
    vi.stubGlobal("caches", { open: caches.open });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: storage, setTimeout: () => 0 });
    const offlineCache = (await import("./offlineAudioCache")) as LoadOfflineCache;
    return { offlineCache, caches, fetchMock, storage };
}

/** A managed variant: two URLs the app really builds for Hartford Beach. */
function hartfordVariant() {
    const variants = getParkAudioVariants(HARTFORD, [
        { name: HARTFORD, recordingsCount: 1, sectionsCount: 1 },
    ], "Chrome");
    if (!variants) throw new Error("test park built no variants");
    return variants[0];
}

function okResponse(bytes: number) {
    return new Response(new ArrayBuffer(bytes), {
        status: 200,
        headers: { "content-length": String(bytes) },
    });
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("fetchAudioBytes", () => {
    let harness: Harness;
    const [spatialUrl, monoUrl] = hartfordVariant();

    beforeEach(async () => {
        harness = await loadHarness();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("serves the network first and reports it", async () => {
        harness.fetchMock.mockImplementation(async () => okResponse(100));
        const result = await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);

        expect(result.fromCache).toBe(false);
        expect(result.bytes.byteLength).toBe(100);
        expect(harness.fetchMock).toHaveBeenCalledWith(spatialUrl, expect.anything());
    });

    it("writes a successful response through to the cache", async () => {
        harness.fetchMock.mockImplementation(async () => okResponse(100));
        await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await flushMicrotasks();

        const store = harness.caches.stores.get("resonant-audio-v1");
        expect(store?.has(spatialUrl)).toBe(true);
    });

    it("falls back to the cache when the network throws, and rethrows when it holds nothing", async () => {
        // Nothing cached yet: the original network error stands.
        harness.fetchMock.mockImplementation(async () => {
            throw new Error("network unreachable");
        });
        await expect(harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal))
            .rejects.toThrow("network unreachable");

        // With the pair cached, the same failure serves held bytes instead.
        harness.fetchMock.mockImplementation(async () => okResponse(100));
        await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await harness.offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        await flushMicrotasks();

        harness.fetchMock.mockImplementation(async () => {
            throw new Error("network unreachable");
        });
        const fromCache = await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        expect(fromCache.fromCache).toBe(true);
    });

    it("falls back to the cache on a failed response, not only a thrown one", async () => {
        harness.fetchMock.mockImplementation(async () => okResponse(100));
        await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await flushMicrotasks();

        harness.fetchMock.mockImplementation(async () => new Response(new ArrayBuffer(0), { status: 503 }));
        const result = await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        expect(result.fromCache).toBe(true);
    });

    it("never writes a load that was already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        harness.fetchMock.mockImplementation(async () => {
            throw new DOMException("Aborted", "AbortError");
        });
        await expect(harness.offlineCache.fetchAudioBytes(spatialUrl, controller.signal))
            .rejects.toThrow("Aborted");
        await flushMicrotasks();

        const store = harness.caches.stores.get("resonant-audio-v1");
        expect(store?.size ?? 0).toBe(0);
    });

    it("rejects an aborted load even when the cache holds the bytes", async () => {
        // Hold the pair first, from a load nobody abandoned.
        harness.fetchMock.mockImplementation(async () => okResponse(100));
        await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await flushMicrotasks();

        // The same URL again, on a signal the loader has already given up on.
        // Answering this one from disk would be worse than useless: the loader
        // checks the signal only after decoding, so a resolved abort spends a
        // whole 8-channel decode on a park the walker has gone past — the cost
        // the abort was raised to avoid. The abort has to win over the cache.
        const controller = new AbortController();
        controller.abort();
        harness.fetchMock.mockImplementation(async () => {
            throw new DOMException("Aborted", "AbortError");
        });
        await expect(harness.offlineCache.fetchAudioBytes(spatialUrl, controller.signal))
            .rejects.toThrow("Aborted");
    });

    it("emits debug events a mirror can read", async () => {
        const events: string[] = [];
        harness.offlineCache.setOfflineCacheEventSink((event) => events.push(event.kind));

        harness.fetchMock.mockImplementation(async () => okResponse(100));
        await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await flushMicrotasks();
        harness.fetchMock.mockImplementation(async () => {
            throw new Error("gone offline");
        });
        await harness.offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);

        expect(events).toContain("cache-write");
        expect(events).toContain("cache-hit");
    });
});

describe("cached-parks store", () => {
    const [spatialUrl, monoUrl] = hartfordVariant();

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("counts a park as held only once its whole pair is cached", async () => {
        const { offlineCache } = await loadHarness(async () => okResponse(100));

        await offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await flushMicrotasks();
        await offlineCache.recomputeCachedParks();
        expect(offlineCache.getCachedParksSnapshot().has(HARTFORD)).toBe(false);

        await offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        await flushMicrotasks();
        await offlineCache.recomputeCachedParks();
        expect(offlineCache.getCachedParksSnapshot().has(HARTFORD)).toBe(true);
    });

    it("answers from the real cache, not from the byte index", async () => {
        const { offlineCache, caches } = await loadHarness(async () => okResponse(100));
        await offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        await flushMicrotasks();

        // Simulate the browser dropping the entry behind the app's back:
        // the index still claims the bytes, the cache does not hold them.
        caches.stores.get("resonant-audio-v1")?.delete(spatialUrl);
        await offlineCache.recomputeCachedParks();
        expect(offlineCache.getCachedParksSnapshot().has(HARTFORD)).toBe(false);
    });
});

describe("findCachedVariantForPark", () => {
    const [spatialUrl, monoUrl] = hartfordVariant();

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns a complete pair and nothing for a half-held one", async () => {
        const { offlineCache } = await loadHarness(async () => okResponse(100));

        await offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await flushMicrotasks();
        expect(await offlineCache.findCachedVariantForPark(HARTFORD)).toBeNull();

        await offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        await flushMicrotasks();
        const variant = await offlineCache.findCachedVariantForPark(HARTFORD);
        expect(variant).toEqual([spatialUrl, monoUrl]);
    });
});

describe("eviction", () => {
    const [spatialUrl, monoUrl] = hartfordVariant();

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("evicts the oldest pairs until the measured budget holds", async () => {
        const { offlineCache, caches } = await loadHarness(async () => okResponse(100));
        // Three pairs at 200 bytes each; the first written is the oldest.
        // 300 keeps the newest pair and nothing else.
        offlineCache.setByteBudgetForTests(300);
        const urls: string[][] = [[spatialUrl, monoUrl]];
        for (let index = 0; index < 2; index += 1) {
            const variants = getParkAudioVariants(HARTFORD, [
                { name: HARTFORD, recordingsCount: 3, sectionsCount: 1 },
            ], "Chrome")!;
            urls.push(variants[index + 1]);
        }
        for (const pair of urls) {
            for (const url of pair) {
                await offlineCache.fetchAudioBytes(url, new AbortController().signal);
            }
        }
        await flushMicrotasks();

        const store = caches.stores.get("resonant-audio-v1")!;
        expect(store.has(urls[0][0])).toBe(false);
        expect(store.has(urls[0][1])).toBe(false);
        expect(store.has(urls[2][0])).toBe(true);
        expect(store.has(urls[2][1])).toBe(true);
    });

    it("sweeps half-fetched pairs before complete ones", async () => {
        const { offlineCache, caches } = await loadHarness(async () => okResponse(100));
        // A complete pair at 200 bytes plus a 100-byte orphan fits, but the
        // orphan alone does not: 250 keeps the pair and nothing else.
        offlineCache.setByteBudgetForTests(250);

        await offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        const secondVariant = getParkAudioVariants(HARTFORD, [
            { name: HARTFORD, recordingsCount: 2, sectionsCount: 1 },
        ], "Chrome")![1];
        await offlineCache.fetchAudioBytes(secondVariant[0], new AbortController().signal);
        await flushMicrotasks();

        const store = caches.stores.get("resonant-audio-v1")!;
        // The orphan goes first even though it is the newest bytes, because
        // half a pair can never play.
        expect(store.has(secondVariant[0])).toBe(false);
        expect(store.has(spatialUrl)).toBe(true);
        expect(store.has(monoUrl)).toBe(true);
    });

    it("adopts bytes on disk the index never learned about, so they can be evicted", async () => {
        const { offlineCache, caches } = await loadHarness(async () => okResponse(100));
        offlineCache.setByteBudgetForTests(300);

        // A URL in Cache Storage with no index entry behind it: a cache.put
        // whose index write quota refused, or a delete that threw after the
        // entry was already swept. Eviction only ever walks the index, so
        // without a reconcile these bytes are never counted and never deleted
        // — they sit there for good, against a budget that cannot see them.
        const stray = getParkAudioVariants(HARTFORD, [
            { name: HARTFORD, recordingsCount: 2, sectionsCount: 1 },
        ], "Chrome")![1][0];
        caches.stores.set("resonant-audio-v1", new Map([[stray, okResponse(100)]]));

        await offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        await flushMicrotasks();

        // Adopted at the estimate and dated to the epoch, which makes it the
        // oldest half-pair in the cache and so the first thing swept.
        const store = caches.stores.get("resonant-audio-v1")!;
        expect(store.has(stray)).toBe(false);
        expect(store.has(spatialUrl)).toBe(true);
        expect(store.has(monoUrl)).toBe(true);
    });

    it("keeps an oversized unmanaged URL evictable, as its own singleton pair", async () => {
        const { offlineCache, caches } = await loadHarness(async () => okResponse(100));
        // The debug pair written first is the oldest thing in the cache;
        // 250 bytes keeps the managed pair and nothing else.
        offlineCache.setByteBudgetForTests(250);

        // A debug-park URL: built by nobody the park index knows.
        const debugUrl = "https://resonant-landscapes.b-cdn.net/sounds/Custer-Test-1-001_8ch.wav";
        await offlineCache.fetchAudioBytes(debugUrl, new AbortController().signal);
        await offlineCache.fetchAudioBytes(spatialUrl, new AbortController().signal);
        await offlineCache.fetchAudioBytes(monoUrl, new AbortController().signal);
        await flushMicrotasks();

        const store = caches.stores.get("resonant-audio-v1")!;
        expect(store.has(debugUrl)).toBe(false);
        expect(store.has(spatialUrl)).toBe(true);
        await offlineCache.recomputeCachedParks();
        // And it never counted as a park being held.
        expect(offlineCache.getCachedParksSnapshot().has("Custer Test")).toBe(false);
    });
});
