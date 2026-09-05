import { describe, expect, it, vi } from "vitest";
import { createBufferCache } from "./bufferCache";
import { createBufferLoader, getCacheKey } from "./bufferLoader";
import { EXPECTED_SPATIAL_CHANNELS } from "./channelCheck";

const buffer = (name: string) => ({ name }) as unknown as AudioBuffer;

/**
 * What `decode` hands back. Its channel count decides the downmix path, and
 * its length and sample rate decide whether the delivery's two files agree
 * about the recording they belong to (rl-74x.5) — so a default pair has to
 * agree, or every test here would take the degraded path.
 */
const decodedBuffer = (
    numberOfChannels: number,
    { length = 2_646_000, sampleRate = 44_100 } = {}
) => ({ name: "decoded", numberOfChannels, length, sampleRate }) as unknown as AudioBuffer;

/** A promise whose settlement this test controls. */
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/**
 * Builds a loader whose network and decode steps are controllable, so the
 * abort and dedup behavior can be proven without real audio or a real fetch.
 */
const setup = ({
    decodedChannels = EXPECTED_SPATIAL_CHANNELS,
    decode,
}: {
    decodedChannels?: number;
    decode?: (data: ArrayBuffer, url: string) => Promise<AudioBuffer>;
} = {}) => {
    const cache = createBufferCache({ maxEntries: 2 });
    const pending = new Map<string, ReturnType<typeof deferred<ArrayBuffer>>>();
    const signals: AbortSignal[] = [];

    // Which URL produced which ArrayBuffer, so a `decode` override can hand
    // back a different buffer per file rather than one for the whole pair.
    const urlOf = new Map<ArrayBuffer, string>();

    const fetchArrayBuffer = vi.fn((url: string, signal: AbortSignal) => {
        signals.push(signal);
        const control = deferred<ArrayBuffer>();
        control.promise.then((data) => urlOf.set(data, url), () => {});
        pending.set(url, control);
        signal.addEventListener("abort", () => {
            control.reject(new DOMException("Aborted", "AbortError"));
        });
        return control.promise;
    });

    const onSpatialDegraded = vi.fn();
    const loadMonoFallback = vi.fn(async () => decodedBuffer(1));

    const loader = createBufferLoader({
        cache,
        fetchArrayBuffer,
        decode: async (data: ArrayBuffer) =>
            decode
                ? decode(data, urlOf.get(data) ?? "")
                : decodedBuffer(decodedChannels),
        merge: (buffers: AudioBuffer[]) => buffer(`merged:${buffers.length}`),
        onSpatialDegraded,
        loadMonoFallback,
    });

    return { cache, loader, fetchArrayBuffer, pending, signals, onSpatialDegraded, loadMonoFallback };
};

describe("createBufferLoader", () => {
    it("returns a cached buffer without touching the network", async () => {
        const { cache, loader, fetchArrayBuffer } = setup();
        const cached = buffer("cached");
        cache.set("a.flac", cached);

        await expect(loader.load(["a.flac"])).resolves.toBe(cached);
        expect(fetchArrayBuffer).not.toHaveBeenCalled();
    });

    it("fetches, merges, and caches on a miss", async () => {
        const { cache, loader, pending } = setup();

        const load = loader.load(["a.flac", "b.flac"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("b.flac")!.resolve(new ArrayBuffer(8));
        const result = await load;

        expect(result).toEqual({ name: "merged:2" });
        expect(cache.get("a.flac::b.flac")).toBe(result);
    });

    it("shares one in-flight request between concurrent callers", async () => {
        const { loader, fetchArrayBuffer, pending } = setup();

        const first = loader.load(["a.flac"]);
        const second = loader.load(["a.flac"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));

        expect(await first).toBe(await second);
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
    });

    it("aborts the underlying request when the load is aborted", async () => {
        const { loader, signals } = setup();

        const load = loader.load(["a.flac"]);
        loader.abort(["a.flac"]);

        await expect(load).rejects.toThrow(/abort/i);
        expect(signals[0].aborted).toBe(true);
    });

    it("does not cache the result of an aborted load", async () => {
        const { cache, loader, pending } = setup();

        const load = loader.load(["a.flac"]);
        loader.abort(["a.flac"]);
        // The network layer may still deliver bytes after the abort.
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        await expect(load).rejects.toThrow();

        expect(cache.get("a.flac")).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it("abortAll aborts every in-flight load", async () => {
        const { loader, signals } = setup();

        const first = loader.load(["a.flac"]);
        const second = loader.load(["b.flac"]);
        loader.abortAll();

        await expect(first).rejects.toThrow();
        await expect(second).rejects.toThrow();
        expect(signals.every((signal) => signal.aborted)).toBe(true);
    });

    it("starts a fresh request after an aborted one", async () => {
        const { loader, fetchArrayBuffer, pending } = setup();

        const first = loader.load(["a.flac"]);
        loader.abort(["a.flac"]);
        await expect(first).rejects.toThrow();

        const retry = loader.load(["a.flac"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));

        await expect(retry).resolves.toEqual({ name: "merged:1" });
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(2);
    });

    it("clears the in-flight entry after a failure so a retry can proceed", async () => {
        const { loader, fetchArrayBuffer, pending } = setup();

        const first = loader.load(["a.flac"]);
        pending.get("a.flac")!.reject(new Error("network down"));
        await expect(first).rejects.toThrow("network down");

        const retry = loader.load(["a.flac"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));

        await expect(retry).resolves.toBeDefined();
        expect(fetchArrayBuffer).toHaveBeenCalledTimes(2);
    });

    it("merges every buffer and stays quiet when the spatial decode is intact", async () => {
        const { loader, pending, onSpatialDegraded } = setup();

        const load = loader.load(["a.flac", "a-mono.wav"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("a-mono.wav")!.resolve(new ArrayBuffer(8));

        await expect(load).resolves.toEqual({ name: "merged:2" });
        expect(onSpatialDegraded).not.toHaveBeenCalled();
    });

    it("drops a downmixed spatial buffer and reports the degradation", async () => {
        const { loader, pending, onSpatialDegraded } = setup({ decodedChannels: 2 });

        const load = loader.load(["a.flac", "a-mono.wav"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("a-mono.wav")!.resolve(new ArrayBuffer(8));

        // Only the independently loaded W fallback reaches merge; the spatial stream would
        // have produced a field that plays but points nowhere.
        await expect(load).resolves.toEqual({ name: "merged:1" });
        expect(onSpatialDegraded).toHaveBeenCalledWith(
            {
                decodedChannels: 2,
                expectedChannels: EXPECTED_SPATIAL_CHANNELS,
                cause: "downmix",
                reason: "downmixed",
            },
            // The key travels with it so the consumer can tell a prefetch's
            // report from the active park's.
            getCacheKey(["a.flac", "a-mono.wav"])
        );
    });

    it("plays a mismatched pair through the W fallback instead of failing the park", async () => {
        // rl-74x.5. Both files decode fine and the spatial one has all eight
        // channels; they just disagree about how long the recording is. That
        // cannot be merged, and until now nothing caught the throw, so the
        // park died on a load error while a perfectly good W mix sat on the
        // CDN next to it.
        const { loader, pending, cache, onSpatialDegraded, loadMonoFallback } = setup({
            decode: async (_data, url) =>
                url.endsWith("-mono.wav")
                    ? decodedBuffer(1, { length: 2_572_353 })
                    : decodedBuffer(EXPECTED_SPATIAL_CHANNELS),
        });

        const load = loader.load(["a.flac", "a-mono.wav"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("a-mono.wav")!.resolve(new ArrayBuffer(8));

        // One buffer reaches merge: the separately fetched W mix. The park
        // plays.
        await expect(load).resolves.toEqual({ name: "merged:1" });
        expect(loadMonoFallback).toHaveBeenCalled();
        expect(cache.size).toBe(1);

        // And the walker is told, rather than it degrading quietly.
        expect(onSpatialDegraded).toHaveBeenCalledWith(
            {
                decodedChannels: EXPECTED_SPATIAL_CHANNELS,
                expectedChannels: EXPECTED_SPATIAL_CHANNELS,
                cause: "pair-mismatch",
                reason: "downmixed",
            },
            getCacheKey(["a.flac", "a-mono.wav"])
        );
    });

    it("still fails a mismatched pair when the W mix cannot be fetched", async () => {
        // The honest end of the same path: there is nothing left to play, so
        // this is a load error and must not be cached as if it were audio.
        const { loader, pending, cache, loadMonoFallback, onSpatialDegraded } = setup({
            decode: async (_data, url) =>
                url.endsWith("-mono.wav")
                    ? decodedBuffer(1, { sampleRate: 48_000 })
                    : decodedBuffer(EXPECTED_SPATIAL_CHANNELS),
        });
        loadMonoFallback.mockRejectedValueOnce(new Error("fallback unavailable"));

        const load = loader.load(["a.flac", "a-mono.wav"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("a-mono.wav")!.resolve(new ArrayBuffer(8));

        await expect(load).rejects.toThrow("fallback unavailable");
        expect(cache.size).toBe(0);
        expect(onSpatialDegraded).toHaveBeenCalledWith(
            expect.objectContaining({ cause: "pair-mismatch", reason: "no-fallback" }),
            getCacheKey(["a.flac", "a-mono.wav"])
        );
    });

    it("fails without caching when a verified fallback is unavailable", async () => {
        const { loader, pending, cache, loadMonoFallback, onSpatialDegraded } = setup({ decodedChannels: 2 });
        loadMonoFallback.mockRejectedValueOnce(new Error("fallback unavailable"));
        const load = loader.load(["a.flac", "legacy-u.wav"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("legacy-u.wav")!.resolve(new ArrayBuffer(8));
        await expect(load).rejects.toThrow("fallback unavailable");
        expect(cache.size).toBe(0);
        expect(onSpatialDegraded).toHaveBeenCalledWith(expect.objectContaining({ reason: "no-fallback" }), "a.flac::legacy-u.wav");
    });

    it("rejects a fallback that is not mono", async () => {
        const { loader, pending, cache, loadMonoFallback } = setup({ decodedChannels: 2 });
        loadMonoFallback.mockResolvedValueOnce(decodedBuffer(2));
        const load = loader.load(["a.flac"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        await expect(load).rejects.toThrow(/mono/i);
        expect(cache.size).toBe(0);
    });

    it("does not cache fallback audio delivered after cancellation", async () => {
        const { loader, pending, cache, loadMonoFallback } = setup({ decodedChannels: 2 });
        const fallback = deferred<AudioBuffer>();
        loadMonoFallback.mockReturnValueOnce(fallback.promise);
        const load = loader.load(["a.flac"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        await vi.waitFor(() => expect(loadMonoFallback).toHaveBeenCalled());
        loader.abort(["a.flac"]);
        fallback.resolve(decodedBuffer(1));
        await expect(load).rejects.toThrow(/abort/i);
        expect(cache.size).toBe(0);
    });

    it("does not re-report the degradation on a cache hit", async () => {
        const { loader, pending, onSpatialDegraded } = setup({ decodedChannels: 2 });

        const load = loader.load(["a.flac", "a-mono.wav"]);
        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        pending.get("a-mono.wav")!.resolve(new ArrayBuffer(8));
        await load;

        await loader.load(["a.flac", "a-mono.wav"]);

        expect(onSpatialDegraded).toHaveBeenCalledTimes(1);
    });

    it("names the load a degradation came from", async () => {
        const { loader, pending, onSpatialDegraded } = setup({ decodedChannels: 2 });

        const load = loader.load(["b.flac", "b-mono.wav"]);
        pending.get("b.flac")!.resolve(new ArrayBuffer(8));
        pending.get("b-mono.wav")!.resolve(new ArrayBuffer(8));
        await load;

        // Without the key a prefetch's report is indistinguishable from the
        // active park's, which is how "this park has no plain mix" could end
        // up over a park that has one.
        const [, reportedKey] = onSpatialDegraded.mock.calls[0];
        expect(reportedKey).toBe(getCacheKey(["b.flac", "b-mono.wav"]));
    });

    it("reports whether a key is currently loading", async () => {
        const { loader, pending } = setup();

        const load = loader.load(["a.flac"]);
        expect(loader.isLoading(["a.flac"])).toBe(true);

        pending.get("a.flac")!.resolve(new ArrayBuffer(8));
        await load;

        expect(loader.isLoading(["a.flac"])).toBe(false);
    });
});
