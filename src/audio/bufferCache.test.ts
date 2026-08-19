import { describe, expect, it } from "vitest";
import { createBufferCache } from "./bufferCache";

/**
 * Stand-in for AudioBuffer. The cache only ever stores and returns these, so
 * the real Web Audio type is not needed to prove the eviction policy.
 */
const buffer = (name: string) => ({ name }) as unknown as AudioBuffer;

describe("createBufferCache", () => {
    it("returns a buffer stored under its key", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        const park = buffer("sica-hollow");

        cache.set("sica-hollow", park);

        expect(cache.get("sica-hollow")).toBe(park);
    });

    it("returns undefined for a key it has never seen", () => {
        const cache = createBufferCache({ maxEntries: 2 });

        expect(cache.get("roy-lake")).toBeUndefined();
    });

    it("evicts the least recently used entry when capacity is exceeded", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        cache.set("a", buffer("a"));
        cache.set("b", buffer("b"));

        cache.set("c", buffer("c"));

        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBeDefined();
        expect(cache.get("c")).toBeDefined();
    });

    it("counts a read as recent use, so the re-read entry survives eviction", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        cache.set("a", buffer("a"));
        cache.set("b", buffer("b"));

        cache.get("a");
        cache.set("c", buffer("c"));

        expect(cache.get("a")).toBeDefined();
        expect(cache.get("b")).toBeUndefined();
    });

    it("never evicts a pinned entry, dropping the next unpinned candidate instead", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        cache.set("playing", buffer("playing"));
        cache.set("stale", buffer("stale"));
        cache.pin("playing");

        cache.set("prefetched", buffer("prefetched"));

        expect(cache.get("playing")).toBeDefined();
        expect(cache.get("stale")).toBeUndefined();
        expect(cache.get("prefetched")).toBeDefined();
    });

    it("lets a previously pinned entry be evicted once it is unpinned", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        cache.set("was-playing", buffer("was-playing"));
        cache.pin("was-playing");
        cache.set("b", buffer("b"));

        cache.unpin("was-playing");
        cache.set("c", buffer("c"));

        expect(cache.get("was-playing")).toBeUndefined();
    });

    it("keeps every entry when all are pinned rather than dropping one in use", () => {
        const cache = createBufferCache({ maxEntries: 1 });
        cache.set("a", buffer("a"));
        cache.pin("a");
        cache.set("b", buffer("b"));
        cache.pin("b");

        expect(cache.get("a")).toBeDefined();
        expect(cache.get("b")).toBeDefined();
        expect(cache.size).toBe(2);
    });

    it("pins a key that has not been stored yet, protecting it once it arrives", () => {
        const cache = createBufferCache({ maxEntries: 1 });
        cache.pin("incoming");
        cache.set("other", buffer("other"));

        cache.set("incoming", buffer("incoming"));

        expect(cache.get("incoming")).toBeDefined();
        expect(cache.get("other")).toBeUndefined();
    });

    it("forgets a deleted entry", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        cache.set("a", buffer("a"));

        cache.delete("a");

        expect(cache.get("a")).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it("drops everything on clear, including pinned entries", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        cache.set("a", buffer("a"));
        cache.pin("a");
        cache.set("b", buffer("b"));

        cache.clear();

        expect(cache.size).toBe(0);
        expect(cache.get("a")).toBeUndefined();
    });

    it("replaces the buffer for an existing key without growing", () => {
        const cache = createBufferCache({ maxEntries: 2 });
        const replacement = buffer("second");
        cache.set("a", buffer("first"));

        cache.set("a", replacement);

        expect(cache.get("a")).toBe(replacement);
        expect(cache.size).toBe(1);
    });
});
