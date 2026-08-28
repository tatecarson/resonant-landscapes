import { beforeEach, describe, expect, it } from "vitest";
import {
    VARIANT_SEED_STORAGE_KEY,
    getVariantSeed,
    rerollVariantSeed,
    resetVariantSeedCache,
} from "./variantSeed";

function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
        read: (key: string) => data.get(key) ?? null,
    };
}

/** Storage that throws on every access, as private browsing can. */
const hostileStorage = {
    getItem: () => {
        throw new Error("SecurityError");
    },
    setItem: () => {
        throw new Error("QuotaExceededError");
    },
};

const constantRandom = (value: number) => () => value;

beforeEach(() => {
    resetVariantSeedCache();
});

describe("getVariantSeed", () => {
    it("returns a stored seed rather than generating one", () => {
        const storage = fakeStorage({ [VARIANT_SEED_STORAGE_KEY]: "12345" });

        expect(getVariantSeed(storage, constantRandom(0.5))).toBe(12345);
    });

    it("generates and persists a seed on the first visit", () => {
        const storage = fakeStorage();

        const seed = getVariantSeed(storage, constantRandom(0.5));

        expect(seed).toBeGreaterThan(0);
        expect(storage.read(VARIANT_SEED_STORAGE_KEY)).toBe(String(seed));
    });

    it("returns the same seed across calls in one session", () => {
        // The correctness property, not an optimisation: prefetch and the
        // active load ask separately, and a different answer between them
        // downloads one recording on approach and plays another on arrival.
        const storage = fakeStorage();
        let calls = 0;
        const varyingRandom = () => {
            calls += 1;
            return calls / 10;
        };

        const first = getVariantSeed(storage, varyingRandom);
        const second = getVariantSeed(storage, varyingRandom);

        expect(second).toBe(first);
    });

    it("holds one seed for the session even with no storage at all", () => {
        let calls = 0;
        const varyingRandom = () => {
            calls += 1;
            return calls / 10;
        };

        const first = getVariantSeed(null, varyingRandom);
        const second = getVariantSeed(null, varyingRandom);

        expect(second).toBe(first);
    });

    it("survives storage that throws on read and write", () => {
        // Private browsing throws on access itself, not just on write.
        const first = getVariantSeed(hostileStorage, constantRandom(0.25));
        const second = getVariantSeed(hostileStorage, constantRandom(0.75));

        expect(Number.isFinite(first)).toBe(true);
        expect(second).toBe(first);
    });

    it("ignores a corrupted stored value and starts over", () => {
        const storage = fakeStorage({ [VARIANT_SEED_STORAGE_KEY]: "not-a-number" });

        const seed = getVariantSeed(storage, constantRandom(0.5));

        expect(Number.isFinite(seed)).toBe(true);
        expect(storage.read(VARIANT_SEED_STORAGE_KEY)).toBe(String(seed));
    });

    it("ignores a negative stored value", () => {
        const storage = fakeStorage({ [VARIANT_SEED_STORAGE_KEY]: "-7" });

        expect(getVariantSeed(storage, constantRandom(0.5))).toBeGreaterThanOrEqual(0);
    });
});

describe("rerollVariantSeed", () => {
    it("replaces the stored seed", () => {
        const storage = fakeStorage({ [VARIANT_SEED_STORAGE_KEY]: "12345" });

        const seed = rerollVariantSeed(storage, constantRandom(0.5));

        expect(seed).not.toBe(12345);
        expect(storage.read(VARIANT_SEED_STORAGE_KEY)).toBe(String(seed));
    });

    it("takes effect immediately, without a reload", () => {
        const storage = fakeStorage();
        getVariantSeed(storage, constantRandom(0.1));

        const rerolled = rerollVariantSeed(storage, constantRandom(0.9));

        expect(getVariantSeed(storage, constantRandom(0.1))).toBe(rerolled);
    });
});
