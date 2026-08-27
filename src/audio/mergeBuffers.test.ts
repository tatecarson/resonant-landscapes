import { describe, expect, it } from "vitest";
import { mergeBuffersByChannel } from "./mergeBuffers";

/**
 * Stand-in for the Web Audio types. The merge only reads length, sampleRate,
 * numberOfChannels and per-channel data, so real AudioBuffers are not needed
 * to prove the channel ordering — which is the part that matters, since a
 * wrong order is inaudible in a test and obviously wrong in a park.
 */
function fakeBuffer(channels: number[][], sampleRate = 48_000) {
    return {
        length: channels[0]?.length ?? 0,
        sampleRate,
        numberOfChannels: channels.length,
        getChannelData: (index: number) => Float32Array.from(channels[index]),
    } as unknown as AudioBuffer;
}

function fakeContext() {
    return {
        createBuffer: (numberOfChannels: number, length: number, sampleRate: number) => {
            const data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
            return {
                numberOfChannels,
                length,
                sampleRate,
                getChannelData: (index: number) => data[index],
            } as unknown as AudioBuffer;
        },
    } as unknown as BaseAudioContext;
}

describe("mergeBuffersByChannel", () => {
    it("concatenates channels in buffer order", () => {
        // The real case: an 8-channel HOA stream followed by a 1-channel bed.
        const merged = mergeBuffersByChannel(fakeContext(), [
            fakeBuffer([[1, 1], [2, 2]]),
            fakeBuffer([[9, 9]]),
        ]);

        expect(merged.numberOfChannels).toBe(3);
        expect(Array.from(merged.getChannelData(0))).toEqual([1, 1]);
        expect(Array.from(merged.getChannelData(1))).toEqual([2, 2]);
        expect(Array.from(merged.getChannelData(2))).toEqual([9, 9]);
    });

    it("preserves length and sample rate", () => {
        const merged = mergeBuffersByChannel(fakeContext(), [
            fakeBuffer([[1, 2, 3]], 44_100),
            fakeBuffer([[4, 5, 6]], 44_100),
        ]);

        expect(merged.length).toBe(3);
        expect(merged.sampleRate).toBe(44_100);
    });

    it("merges a single buffer unchanged", () => {
        const merged = mergeBuffersByChannel(fakeContext(), [fakeBuffer([[1, 2]])]);

        expect(merged.numberOfChannels).toBe(1);
        expect(Array.from(merged.getChannelData(0))).toEqual([1, 2]);
    });

    it("rejects mismatched lengths rather than truncating", () => {
        // Truncating would offset one stream against the other — audible only
        // as "the park sounds wrong", and impossible to trace later.
        expect(() =>
            mergeBuffersByChannel(fakeContext(), [
                fakeBuffer([[1, 2, 3]]),
                fakeBuffer([[1, 2]]),
            ])
        ).toThrow(/lengths are inconsistent/);
    });

    it("rejects mismatched sample rates", () => {
        expect(() =>
            mergeBuffersByChannel(fakeContext(), [
                fakeBuffer([[1, 2]], 48_000),
                fakeBuffer([[1, 2]], 44_100),
            ])
        ).toThrow(/sample rates are inconsistent/);
    });

    it("rejects more than 32 channels", () => {
        const wide = fakeBuffer(Array.from({ length: 33 }, () => [0, 0]));

        expect(() => mergeBuffersByChannel(fakeContext(), [wide])).toThrow(/cannot exceed 32/);
    });

    it("rejects an empty list", () => {
        expect(() => mergeBuffersByChannel(fakeContext(), [])).toThrow(/no buffers/);
    });
});
