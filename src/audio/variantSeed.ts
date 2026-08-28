const STORAGE_KEY = "audioVariantSeed";
const MAX_SEED = 0x7fffffff;

/** The slice of Storage this needs, so tests do not need a DOM. */
export type SeedStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Resolved once per session.
 *
 * This memo is not an optimisation — it is the correctness property. The seed
 * decides which recording of a park plays, and prefetch and the active load
 * ask separately: if the answer changed between those two calls, the walker
 * would download one recording on approach and a different one on arrival.
 * Where no storage is available (private browsing) that is the only thing
 * holding the choice still.
 */
let cachedSeed: number | null = null;

function defaultStorage(): SeedStorage | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        // Private browsing and blocked-cookie settings throw on access itself.
        return null;
    }
}

function generateSeed(random: () => number) {
    return Math.floor(random() * MAX_SEED);
}

function readStoredSeed(storage: SeedStorage): number | null {
    try {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored === null) {
            return null;
        }
        const parsed = Number(stored);
        return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
    } catch {
        return null;
    }
}

/**
 * The seed that decides which recording of a park the walker hears.
 *
 * It used to be Math.random() at module scope, so every page load picked
 * different recordings. That made the 10-25 MB payloads impossible to cache
 * deterministically — a repeat visit re-downloaded a *different* recording of
 * the same park — and it made the piece confusing: walk somewhere twice, hear
 * two different things, with nothing to explain why.
 *
 * Persisting it means a walker's parks stay theirs across visits, and the
 * offline work has something stable to precache. Rerolling becomes deliberate
 * rather than a side effect of reloading the page.
 */
export function getVariantSeed(
    storage: SeedStorage | null = defaultStorage(),
    random: () => number = Math.random
): number {
    if (cachedSeed !== null) {
        return cachedSeed;
    }

    const stored = storage ? readStoredSeed(storage) : null;
    if (stored !== null) {
        cachedSeed = stored;
        return stored;
    }

    const seed = generateSeed(random);
    cachedSeed = seed;

    try {
        storage?.setItem(STORAGE_KEY, String(seed));
    } catch {
        // Storage full or blocked mid-session. The seed still holds for this
        // session; it just will not survive a reload.
    }

    return seed;
}

/** Pick a different set of recordings, and keep that choice. */
export function rerollVariantSeed(
    storage: SeedStorage | null = defaultStorage(),
    random: () => number = Math.random
): number {
    const seed = generateSeed(random);
    cachedSeed = seed;

    try {
        storage?.setItem(STORAGE_KEY, String(seed));
    } catch {
        // As above: applies to this session regardless.
    }

    return seed;
}

/** Test seam: forget the memo so the next read resolves fresh. */
export function resetVariantSeedCache() {
    cachedSeed = null;
}

export const VARIANT_SEED_STORAGE_KEY = STORAGE_KEY;
