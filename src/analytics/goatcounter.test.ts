import { beforeEach, describe, expect, it, vi } from "vitest";

type CountOptions = { path?: string; event?: boolean; title?: string };
type GoatCounter = { count: (options?: CountOptions) => void };

interface FakeElement {
    src: string;
    async: boolean;
    dataset: Record<string, string>;
    onload: (() => void) | null;
}

/**
 * The script tag is a module-level singleton, so every case loads the module
 * fresh, and the DOM it wants is stubbed narrowly: document.createElement and
 * head.appendChild, with handles kept so assertions can reach them.
 */
async function loadAnalytics(site?: string) {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (site !== undefined) {
        vi.stubEnv("VITE_GOATCOUNTER_SITE", site);
    }

    vi.stubGlobal("window", {
        localStorage: {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
        },
        goatcounter: undefined as GoatCounter | undefined,
    });

    const createElement = vi.fn((): FakeElement => ({
        src: "",
        async: false,
        dataset: {},
        onload: null,
    }));
    const appendChild = vi.fn();
    vi.stubGlobal("document", {
        createElement,
        head: { appendChild },
    });

    const mod = await import("./goatcounter");
    const firstScript = (): FakeElement => createElement.mock.results[0].value as FakeElement;
    const setGoatCounter = (count: GoatCounter["count"]) => {
        (window as unknown as { goatcounter?: GoatCounter }).goatcounter = { count };
    };
    return { ...mod, createElement, appendChild, firstScript, setGoatCounter };
}

describe("goatcounter", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("loads nothing at all when no site code is set", async () => {
        const { initGoatCounter, countEvent, createElement } = await loadAnalytics();
        initGoatCounter("chatham");
        countEvent("park-heard");
        expect(createElement).not.toHaveBeenCalled();
    });

    it("injects the counting script once, pointed at the site", async () => {
        const { initGoatCounter, createElement, appendChild } = await loadAnalytics("resonant-landscapes");
        initGoatCounter("chatham");
        initGoatCounter("chatham");

        expect(createElement).toHaveBeenCalledTimes(1);
        expect(appendChild).toHaveBeenCalledTimes(1);
        const script = createElement.mock.results[0].value;
        expect(script.src).toBe("https://gc.zgo.at/count.js");
        // The /count path is the endpoint; the bare site is the dashboard.
        expect(script.dataset.goatcounter).toBe("https://resonant-landscapes.goatcounter.com/count");
        // Its own pageview would be filed under the path, which is "/" for
        // #/chatham; the visit is counted by hand instead.
        expect(JSON.parse(script.dataset.goatcounterSettings)).toEqual({ no_onload: true });
    });

    it("queues an event fired before the script loads, and flushes on load", async () => {
        const { initGoatCounter, countEvent, firstScript, setGoatCounter } = await loadAnalytics("resonant-landscapes");
        initGoatCounter("chatham");

        const counted: CountOptions[] = [];
        countEvent("walk-started");
        expect(counted).toEqual([]);

        setGoatCounter((options) => {
            if (options) counted.push(options);
        });
        firstScript().onload?.();
        expect(counted).toEqual([
            { path: "/chatham", event: false },
            { path: "chatham/walk-started", event: true },
        ]);
    });

    it("counts an event once per page load when asked", async () => {
        const { initGoatCounter, countEventOnce, countEvent, setGoatCounter } = await loadAnalytics("resonant-landscapes");
        initGoatCounter("chatham");

        const counted: string[] = [];
        setGoatCounter((options) => {
            if (options?.path) counted.push(options.path);
        });

        countEventOnce("walk-started");
        countEventOnce("walk-started");
        countEvent("park-heard");
        countEvent("park-heard");
        expect(counted).toEqual(["chatham/walk-started", "chatham/park-heard", "chatham/park-heard"]);
    });

    it("drops events fired before the visit starts being counted", async () => {
        const { initGoatCounter, countEvent, createElement, firstScript, setGoatCounter } = await loadAnalytics("resonant-landscapes");
        countEvent("park-heard");
        expect(createElement).not.toHaveBeenCalled();

        initGoatCounter("chatham");
        const count = vi.fn();
        setGoatCounter(count);
        firstScript().onload?.();
        // The visit, and not the event from before it.
        expect(count.mock.calls).toEqual([[{ path: "/chatham", event: false }]]);
    });

    /*
     * Chatham on its own (rl-qhn9). The walk is opened as #/chatham, which
     * count.js would have filed as "/" alongside DSU, and the events carried
     * no site at all.
     */
    it.each(["chatham", "terrace", "dsu"])("counts the visit and its events under %s", async (walk) => {
        const { initGoatCounter, countEvent, firstScript, setGoatCounter } = await loadAnalytics("resonant-landscapes");
        initGoatCounter(walk);
        const paths: string[] = [];
        setGoatCounter((options) => {
            if (options?.path) paths.push(options.path);
        });
        firstScript().onload?.();
        countEvent("park-heard");
        expect(paths).toEqual([`/${walk}`, `${walk}/park-heard`]);
    });

    it("counts one visit however often it is started", async () => {
        const { initGoatCounter, firstScript, setGoatCounter } = await loadAnalytics("resonant-landscapes");
        initGoatCounter("chatham");
        initGoatCounter("chatham");
        const count = vi.fn();
        setGoatCounter(count);
        firstScript().onload?.();
        expect(count).toHaveBeenCalledTimes(1);
    });

    it("files later events under the walk the page moved to", async () => {
        const { initGoatCounter, countEvent, setCountingSite, setGoatCounter } = await loadAnalytics("resonant-landscapes");
        initGoatCounter("dsu");
        const paths: string[] = [];
        setGoatCounter((options) => {
            if (options?.path) paths.push(options.path);
        });
        setCountingSite("chatham");
        countEvent("walk-started");
        expect(paths).toEqual(["chatham/walk-started"]);
    });
});
