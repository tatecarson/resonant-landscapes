import { describe, expect, it, vi } from "vitest";
import { createBufferCache } from "./bufferCache";
import { createBufferLoader, getCacheKey } from "./bufferLoader";
import { EXPECTED_SPATIAL_CHANNELS } from "./channelCheck";

const buffer = (name: string) => ({ name }) as unknown as AudioBuffer;

/** What `decode` hands back — only its channel count is inspected. */
const decodedBuffer = (numberOfChannels: number) =>
    ({ name: "decoded", numberOfChannels }) as unknown as AudioBuffer;

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
const setup = ({ decodedChannels = EXPECTED_SPATIAL_CHANNELS } = {}) => {
    const cache = createBufferCache({ maxEntries: 2 });
    const pending = new Map<string, ReturnType<typeof deferred<ArrayBuffer>>>();
    const signals: AbortSignal[] = [];

    const fetchArrayBuffer = vi.fn((url: string, signal: AbortSignal) => {
        signals.push(signal);
        const control = deferred<ArrayBuffer>();
        pending.set(url, control);
        signal.addEventListener("abort", () => {
            control.reject(new DOMException("Aborted", "AbortError"));
        });
        return control.promise;
    });

    const onSpatialDegraded = vi.fn();

    const loader = createBufferLoader({
        cache,
        fetchArrayBuffer,
        decode: async (_data: ArrayBuffer) => decodedBuffer(decodedChannels),
        merge: (buffers: AudioBuffer[]) => buffer(`merged:${buffers.length}`),
        onSpatialDegraded,
    });

    return { cache, loader, fetchArrayBuffer, pending, signals, onSpatialDegraded };
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

        // Only the mono bed reaches merge — the collapsed spatial stream would
        // have produced a field that plays but points nowhere.
        await expect(load).resolves.toEqual({ name: "merged:1" });
        expect(onSpatialDegraded).toHaveBeenCalledWith(
            {
                decodedChannels: 2,
                expectedChannels: EXPECTED_SPATIAL_CHANNELS,
                reason: "downmixed",
            },
            // The key travels with it so the consumer can tell a prefetch's
            // report from the active park's.
            getCacheKey(["a.flac", "a-mono.wav"])
        );
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
