import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    createAudioDebugBridge,
    type AudioDebugMirror,
    type AudioLoadDebug,
} from "./audioDebugBridge";

const load: AudioLoadDebug = {
    urls: ["/audio/park.flac", "/audio/park-mono.flac"],
    reason: "prefetch",
    startedAt: 1000,
    completedAt: 1400,
    durationMs: 400,
    cacheHit: false,
};

function setup(overrides: Partial<Parameters<typeof createAudioDebugBridge>[0]> = {}) {
    const published: AudioDebugMirror[] = [];
    const bridge = createAudioDebugBridge({
        getSourceNode: () => null,
        getCacheSize: () => 0,
        isEnabled: () => true,
        readUiStatus: () => null,
        publish: (mirror) => published.push(mirror),
        ...overrides,
    });
    return { bridge, published, latest: () => published[published.length - 1] };
}

describe("createAudioDebugBridge", () => {
    it("publishes nothing until something asks it to", () => {
        const { bridge, published } = setup();

        bridge.recordEvent("load-start");
        bridge.update({ isLoading: true });

        expect(published).toHaveLength(0);
        expect(bridge.getLastEvent()).toBe("load-start");
    });

    it("mirrors provider state onto the published shape", () => {
        const buffers = { duration: 92.5, numberOfChannels: 9 } as AudioBuffer;
        const { bridge, latest } = setup({ getCacheSize: () => 2 });

        bridge.update({
            audioContextState: "running",
            isEngineInitializing: false,
            isPlaying: true,
            isAudioUnlocked: true,
            buffers,
            activeUrls: load.urls,
            lastLoad: load,
        });
        bridge.sync("playback-started");

        expect(latest()).toMatchObject({
            contextState: "running",
            isPlaying: true,
            hasBuffers: true,
            bufferDuration: 92.5,
            bufferChannels: 9,
            lastEvent: "playback-started",
            activeUrls: load.urls,
            cacheEntries: 2,
            lastLoadReason: "prefetch",
            lastLoadDurationMs: 400,
            lastLoadCacheHit: false,
        });
    });

    it("reads the source node live, because it is replaced on every playback", () => {
        let sourceNode: AudioBufferSourceNode | null = null;
        const { bridge, latest } = setup({ getSourceNode: () => sourceNode });

        bridge.sync("play-ignored");
        expect(latest().hasSourceNode).toBe(false);

        sourceNode = {} as AudioBufferSourceNode;
        bridge.sync("playback-started");
        expect(latest().hasSourceNode).toBe(true);
    });

    it("keeps recording events when the mirror is switched off", () => {
        // A production build stops writing an object nobody reads. Losing
        // track of where playback got to is a different thing, and would make
        // the debug panel useless the moment someone appends ?debug.
        const { bridge, published } = setup({ isEnabled: () => false });

        bridge.sync("unlock-error");

        expect(published).toHaveLength(0);
        expect(bridge.getLastEvent()).toBe("unlock-error");
    });

    it("carries the UI status through instead of erasing it", () => {
        // HOARenderer writes uiStatus onto the same object, and the mobile
        // specs poll it. Republishing without reading it back blanked it on
        // every state change.
        const { bridge, latest } = setup({ readUiStatus: () => "playing" });

        bridge.sync("context-state-changed");

        expect(latest().uiStatus).toBe("playing");
    });

    it("leaves the event alone on a bare sync and clears it on an explicit null", () => {
        const { bridge, latest } = setup();

        bridge.sync("buffers-loaded");
        bridge.sync();
        expect(latest().lastEvent).toBe("buffers-loaded");

        bridge.sync(null);
        expect(latest().lastEvent).toBeNull();
    });

    it("merges updates rather than replacing the snapshot", () => {
        const { bridge } = setup();

        bridge.update({ activeUrls: load.urls, lastLoad: load });
        bridge.update({ isPlaying: true });

        expect(bridge.getSnapshot()).toMatchObject({
            activeUrls: load.urls,
            lastLoad: load,
            isPlaying: true,
        });
    });

    it("defaults to the real window without being handed one", () => {
        const fakeWindow = {
            __audioDebug: { uiStatus: "preparing" } as AudioDebugMirror,
        };
        vi.stubGlobal("window", fakeWindow);
        try {
            const bridge = createAudioDebugBridge({
                getSourceNode: () => null,
                getCacheSize: () => 0,
                isEnabled: () => true,
            });

            bridge.sync("load-start");

            expect(fakeWindow.__audioDebug.lastEvent).toBe("load-start");
            expect(fakeWindow.__audioDebug.uiStatus).toBe("preparing");
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("the event union", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("is what stops a spec polling for a name the provider never emits", () => {
        const { bridge, latest } = setup();

        // @ts-expect-error "playback-startd" is not an AudioEvent.
        bridge.sync("playback-startd");

        expect(latest().lastEvent).toBe("playback-startd");
    });
});
