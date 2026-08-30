import { beforeEach, describe, expect, it } from "vitest";
import { getVariantSeed, rerollVariantSeed, resetVariantSeedCache } from "./variantSeed";

/** Returns a different value on every call, so a missing memo shows up. */
function varyingRandom() {
    let calls = 0;
    return () => {
        calls += 1;
        return calls / 10;
    };
}

beforeEach(() => {
    resetVariantSeedCache();
});

describe("getVariantSeed", () => {
    it("returns the same seed across calls in one session", () => {
        // The correctness property, not an optimisation: prefetch and the
        // active load ask separately, and a different answer between them
        // downloads one recording on approach and plays another on arrival.
        const random = varyingRandom();

        expect(getVariantSeed(random)).toBe(getVariantSeed(random));
    });

    it("produces a fresh seed for a fresh session", () => {
        // Variety across visits is the point of recording each park more than
        // once; persisting this would freeze a walker onto one recording of
        // each park permanently.
        const first = getVariantSeed(() => 0.1);
        resetVariantSeedCache();
        const second = getVariantSeed(() => 0.9);

        expect(second).not.toBe(first);
    });

    it("stays within the positive 31-bit range the hash expects", () => {
        expect(getVariantSeed(() => 0.999999)).toBeLessThan(0x7fffffff);
        resetVariantSeedCache();
        expect(getVariantSeed(() => 0)).toBeGreaterThanOrEqual(0);
    });
});

describe("rerollVariantSeed", () => {
    it("takes effect immediately, without a reload", () => {
        getVariantSeed(() => 0.1);

        const rerolled = rerollVariantSeed(() => 0.9);

        expect(getVariantSeed(() => 0.1)).toBe(rerolled);
    });
});
