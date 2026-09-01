import { describe, expect, it, vi } from "vitest";
import {
    LIMITER_SETTINGS,
    MASTER_GAIN,
    createAudioGraph,
    primeAudioContext,
} from "./audioGraph";

type FakeNode = {
    name: string;
    connectedTo: string[];
    disconnected: boolean;
    connect: (target: FakeNode) => void;
    disconnect: () => void;
};

const node = (name: string): FakeNode => {
    const created: FakeNode = {
        name,
        connectedTo: [],
        disconnected: false,
        connect: (target: FakeNode) => {
            created.connectedTo.push(target.name);
        },
        disconnect: () => {
            created.disconnected = true;
        },
    };
    return created;
};

const param = () => ({ value: 0 });

function fakeContext() {
    const destination = node("destination");
    const gains: (FakeNode & { gain: { value: number } })[] = [];
    const sources: (FakeNode & {
        buffer: unknown;
        onended: (() => void) | null;
        started: number[];
        stopped: number[];
    })[] = [];
    const compressors: (FakeNode & { threshold: { value: number } })[] = [];

    const context = {
        destination,
        currentTime: 10,
        sampleRate: 48000,
        createGain: () => {
            const gain = Object.assign(node(`gain${gains.length}`), { gain: param() });
            gains.push(gain);
            return gain;
        },
        createDynamicsCompressor: () => {
            const compressor = Object.assign(node("limiter"), {
                threshold: param(),
                knee: param(),
                ratio: param(),
                attack: param(),
                release: param(),
            });
            compressors.push(compressor);
            return compressor;
        },
        createBuffer: vi.fn((channels: number, length: number, rate: number) => ({
            channels,
            length,
            rate,
        })),
        createBufferSource: () => {
            const source = Object.assign(node(`source${sources.length}`), {
                buffer: null as unknown,
                onended: null as (() => void) | null,
                started: [] as number[],
                stopped: [] as number[],
                start: (when: number) => {
                    source.started.push(when);
                },
                stop: (when: number) => {
                    source.stopped.push(when);
                },
            });
            sources.push(source);
            return source;
        },
    };

    return { context, destination, gains, sources, compressors };
}

describe("createAudioGraph", () => {
    it("wires the scene input through the master gain and limiter to the speakers", () => {
        const { context, gains, compressors } = fakeContext();

        const chain = createAudioGraph(context as unknown as BaseAudioContext);

        expect(chain.input).toBe(chain.masterGain);
        expect(gains[0].connectedTo).toEqual(["limiter"]);
        expect(compressors[0].connectedTo).toEqual(["destination"]);
    });

    it("applies the documented gain and limiter tuning", () => {
        const { context } = fakeContext();

        const chain = createAudioGraph(context as unknown as BaseAudioContext);

        expect(chain.masterGain.gain.value).toBe(MASTER_GAIN);
        expect(chain.limiter.threshold.value).toBe(LIMITER_SETTINGS.threshold);
        expect(chain.limiter.knee.value).toBe(LIMITER_SETTINGS.knee);
        expect(chain.limiter.ratio.value).toBe(LIMITER_SETTINGS.ratio);
        expect(chain.limiter.attack.value).toBe(LIMITER_SETTINGS.attack);
        expect(chain.limiter.release.value).toBe(LIMITER_SETTINGS.release);
    });

    it("keeps the limiter a peak catcher rather than an audible compressor", () => {
        // The field recordings have to keep their dynamic range. A soft knee
        // or a slow attack here would be inaudible in review and wrong in a
        // park, so the intent is pinned rather than left to the numbers.
        expect(LIMITER_SETTINGS.knee).toBe(0);
        expect(LIMITER_SETTINGS.ratio).toBeGreaterThanOrEqual(10);
        expect(LIMITER_SETTINGS.threshold).toBeGreaterThan(-3);
    });

    it("disconnects only what it built", () => {
        const { context, destination } = fakeContext();

        const chain = createAudioGraph(context as unknown as BaseAudioContext);
        chain.disconnect();

        expect((chain.masterGain as unknown as FakeNode).disconnected).toBe(true);
        expect((chain.limiter as unknown as FakeNode).disconnected).toBe(true);
        expect(destination.disconnected).toBe(false);
    });
});

describe("primeAudioContext", () => {
    it("plays one silent sample and schedules its own stop", () => {
        const { context, gains, sources } = fakeContext();

        primeAudioContext(context as unknown as BaseAudioContext);

        expect(gains[0].gain.value).toBe(0);
        expect(context.createBuffer).toHaveBeenCalledWith(1, 1, 48000);
        expect(sources[0].started).toEqual([0]);
        expect(sources[0].stopped).toEqual([10.001]);
    });

    it("tears its own nodes down once the sample has played", () => {
        const { context, gains, sources } = fakeContext();

        primeAudioContext(context as unknown as BaseAudioContext);
        sources[0].onended?.();

        expect(sources[0].disconnected).toBe(true);
        expect(gains[0].disconnected).toBe(true);
    });
});
