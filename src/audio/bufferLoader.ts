import type { BufferCache } from "./bufferCache";
import { planDecodedBuffers, type SpatialDegradation } from "./channelCheck";

export interface BufferLoaderDeps {
    cache: BufferCache;
    fetchArrayBuffer: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
    decode: (data: ArrayBuffer) => Promise<AudioBuffer>;
    merge: (buffers: AudioBuffer[]) => AudioBuffer;
    /**
     * Called when the spatial file did not decode to its full channel count.
     * Fires per load, not per cache hit.
     *
     * The cache key comes with it because the two reasons have different
     * scopes. A `downmixed` result is a fact about the browser: an engine that
     * collapses one park's 8-channel file collapses every park's, so the
     * consumer should treat it as sticky and global. A `no-fallback` result is
     * a fact about one payload, and a prefetch can report it for a park the
     * walker is not in, so the consumer has to check the key before showing it.
     */
    onSpatialDegraded?: (degradation: SpatialDegradation, cacheKey: string) => void;
}

export interface BufferLoader {
    load(urls: string[]): Promise<AudioBuffer>;
    abort(urls: string[]): void;
    abortAll(): void;
    isLoading(urls: string[]): boolean;
}

export const getCacheKey = (urls: string[]) => urls.join("::");

export const isAbortError = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";

/**
 * Loads and merges the per-park audio files, de-duplicating concurrent
 * requests for the same set of URLs and caching the merged result.
 *
 * Every load runs under an AbortController so a prefetch that is no longer
 * wanted stops consuming bandwidth immediately — walking past a cluster of
 * parks otherwise leaves several 10-25 MB downloads competing with the park
 * the listener actually entered.
 */
export const createBufferLoader = ({
    cache,
    fetchArrayBuffer,
    decode,
    merge,
    onSpatialDegraded,
}: BufferLoaderDeps): BufferLoader => {
    interface InFlight {
        promise: Promise<AudioBuffer>;
        controller: AbortController;
    }

    const inFlight = new Map<string, InFlight>();

    const load = (urls: string[]): Promise<AudioBuffer> => {
        const key = getCacheKey(urls);

        const cached = cache.get(key);
        if (cached) return Promise.resolve(cached);

        const existing = inFlight.get(key);
        if (existing) return existing.promise;

        const controller = new AbortController();
        const { signal } = controller;

        const promise = (async () => {
            const payloads = await Promise.all(
                urls.map((url) => fetchArrayBuffer(url, signal))
            );
            const decoded = await Promise.all(payloads.map(decode));

            // The fetch layer may deliver bytes even after an abort; never
            // let a cancelled load populate the cache.
            if (signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }

            // Trust nothing about the decode: a browser that quietly collapsed
            // the 8-channel stream would otherwise produce a walk that plays
            // and looks right with no spatial field at all.
            const { buffers, degradation } = planDecodedBuffers(decoded);
            if (degradation) {
                onSpatialDegraded?.(degradation, key);
            }

            const merged = merge(buffers);
            cache.set(key, merged);
            return merged;
        })();

        const tracked = promise.finally(() => {
            // Only clear our own entry — a retry may already have replaced it.
            if (inFlight.get(key)?.promise === tracked) {
                inFlight.delete(key);
            }
        });

        inFlight.set(key, { promise: tracked, controller });
        return tracked;
    };

    const abortKey = (key: string) => {
        const entry = inFlight.get(key);
        if (!entry) return;
        inFlight.delete(key);
        entry.controller.abort();
    };

    return {
        load,
        abort: (urls) => abortKey(getCacheKey(urls)),
        abortAll: () => {
            for (const key of [...inFlight.keys()]) abortKey(key);
        },
        isLoading: (urls) => inFlight.has(getCacheKey(urls)),
    };
};
