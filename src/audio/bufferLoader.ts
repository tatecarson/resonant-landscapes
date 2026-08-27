import type { BufferCache } from "./bufferCache";

export interface BufferLoaderDeps {
    cache: BufferCache;
    fetchArrayBuffer: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
    decode: (data: ArrayBuffer) => Promise<AudioBuffer>;
    merge: (buffers: AudioBuffer[]) => AudioBuffer;
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

            const merged = merge(decoded);
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
