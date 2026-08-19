export interface BufferCacheOptions {
    maxEntries: number;
}

export interface BufferCache {
    get(key: string): AudioBuffer | undefined;
    set(key: string, buffer: AudioBuffer): void;
    /** Protect a key from eviction. Safe to call before the buffer arrives. */
    pin(key: string): void;
    unpin(key: string): void;
    delete(key: string): void;
    clear(): void;
    readonly size: number;
}

/**
 * Least-recently-used cache for decoded audio buffers.
 *
 * A merged park buffer is 9 channels of float PCM — on the order of 100 MB per
 * minute of audio — so an unbounded cache exhausts mobile Safari within a walk.
 *
 * Pinning exists because eviction and prefetch race: prefetch inserts the next
 * park while the current one is still playing, and dropping a buffer that a
 * live AudioBufferSourceNode is reading from is worse than exceeding the cap.
 * A pinned key is never evicted, so the cap is a target rather than a hard
 * ceiling.
 */
export const createBufferCache = ({ maxEntries }: BufferCacheOptions): BufferCache => {
    // Map iteration is insertion-ordered, which makes it the recency list:
    // oldest first, most recently used last.
    const entries = new Map<string, AudioBuffer>();
    const pinned = new Set<string>();

    const evictUntilWithinCapacity = (justWrittenKey: string) => {
        for (const key of entries.keys()) {
            if (entries.size <= maxEntries) return;
            // Never evict a pinned buffer, nor the entry just written — that
            // one is by definition the most recently used.
            if (key === justWrittenKey || pinned.has(key)) continue;
            entries.delete(key);
        }
    };

    return {
        get(key) {
            const buffer = entries.get(key);
            if (!buffer) return undefined;
            // Re-insert to mark as most recently used.
            entries.delete(key);
            entries.set(key, buffer);
            return buffer;
        },

        set(key, buffer) {
            entries.delete(key);
            entries.set(key, buffer);
            evictUntilWithinCapacity(key);
        },

        pin(key) {
            pinned.add(key);
        },

        unpin(key) {
            pinned.delete(key);
        },

        delete(key) {
            entries.delete(key);
            pinned.delete(key);
        },

        clear() {
            entries.clear();
            pinned.clear();
        },

        get size() {
            return entries.size;
        },
    };
};
