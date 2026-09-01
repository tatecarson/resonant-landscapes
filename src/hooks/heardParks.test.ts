import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store reads localStorage at module load, so each case that cares about
 * what was already stored has to import it fresh.
 */
async function loadStore(stored?: string) {
    const store = new Map<string, string>();
    if (stored !== undefined) store.set("heardParks", stored);

    vi.stubGlobal("window", {
        localStorage: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
        },
    });
    vi.resetModules();
    const mod = await import("./heardParks");
    return { ...mod, written: () => store.get("heardParks") };
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("heard parks", () => {
    it("starts empty when nothing was stored", async () => {
        const { useHeardParks: _unused, markParkHeard, written } = await loadStore();
        expect(written()).toBeUndefined();
        markParkHeard("Hartford Beach State Park");
        expect(JSON.parse(written()!)).toEqual(["Hartford Beach State Park"]);
    });

    it("restores what a previous walk heard", async () => {
        const { markParkHeard, written } = await loadStore('["Sica Hollow State Park"]');
        markParkHeard("Hartford Beach State Park");
        expect(JSON.parse(written()!)).toEqual([
            "Sica Hollow State Park",
            "Hartford Beach State Park",
        ]);
    });

    it("does not notify when a park was already heard", async () => {
        // Otherwise every position fix inside a park it has already recorded
        // would re-render every marker on the map.
        const { markParkHeard, written } = await loadStore('["Sica Hollow State Park"]');
        const before = written();

        markParkHeard("Sica Hollow State Park");

        expect(written()).toBe(before);
    });

    it("ignores an empty name rather than storing one", async () => {
        const { markParkHeard, written } = await loadStore();
        markParkHeard("");
        expect(written()).toBeUndefined();
    });

    it("survives a stored value that is not an array of names", async () => {
        // A half-written array should cost a marker, not the map.
        for (const junk of ['{"not":"an array"}', "[1,2,3]", "not json at all"]) {
            const { markParkHeard, written } = await loadStore(junk);
            markParkHeard("Hartford Beach State Park");
            expect(JSON.parse(written()!)).toEqual(["Hartford Beach State Park"]);
        }
    });

    it("keeps counting this session when storage refuses to write", async () => {
        vi.stubGlobal("window", {
            localStorage: {
                getItem: () => null,
                setItem: () => {
                    throw new Error("QuotaExceededError");
                },
                removeItem: () => {},
            },
        });
        vi.resetModules();
        const { markParkHeard, useHeardParks } = await import("./heardParks");

        expect(() => markParkHeard("Hartford Beach State Park")).not.toThrow();
        expect(typeof useHeardParks).toBe("function");
    });

    it("clears everything on reset", async () => {
        const { markParkHeard, resetHeardParks, written } = await loadStore();
        markParkHeard("Hartford Beach State Park");
        resetHeardParks();
        expect(JSON.parse(written()!)).toEqual([]);
    });
});
