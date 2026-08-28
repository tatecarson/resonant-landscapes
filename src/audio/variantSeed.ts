const MAX_SEED = 0x7fffffff;

/**
 * Resolved once per session, and deliberately not persisted.
 *
 * Most parks hold several recordings — Hartford Beach has 16, Sica Hollow 6 —
 * and hearing a different one on a later visit is the point of having made
 * them. A seed stored in localStorage would freeze a walker onto one recording
 * of each park forever, which trades the work away for a cache hit.
 *
 * The memo is still the correctness property, though. The seed decides which
 * recording plays, and prefetch and the active load ask separately: if the
 * answer changed between those two calls, the walker would download one
 * recording on approach and hear a different one on arrival.
 */
let cachedSeed: number | null = null;

function generateSeed(random: () => number) {
    return Math.floor(random() * MAX_SEED);
}

/** The seed that decides which recording of a park the walker hears today. */
export function getVariantSeed(random: () => number = Math.random): number {
    if (cachedSeed === null) {
        cachedSeed = generateSeed(random);
    }
    return cachedSeed;
}

/**
 * Draw a different set of recordings without reloading.
 *
 * Exposed for a "hear another recording" control; nothing calls it yet.
 */
export function rerollVariantSeed(random: () => number = Math.random): number {
    cachedSeed = generateSeed(random);
    return cachedSeed;
}

/** Test seam: forget the memo so the next read resolves fresh. */
export function resetVariantSeedCache() {
    cachedSeed = null;
}
