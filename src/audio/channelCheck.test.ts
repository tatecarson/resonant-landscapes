import { describe, expect, it } from "vitest";
import { EXPECTED_SPATIAL_CHANNELS, planDecodedBuffers } from "./channelCheck";

const buffer = (name: string, numberOfChannels: number) =>
    ({ name, numberOfChannels }) as unknown as AudioBuffer;

const spatial = buffer("spatial", EXPECTED_SPATIAL_CHANNELS);
const mono = buffer("mono", 1);

describe("planDecodedBuffers", () => {
    it("merges everything when the spatial file decoded to 8 channels", () => {
        const plan = planDecodedBuffers([spatial, mono]);

        expect(plan.buffers).toEqual([spatial, mono]);
        expect(plan.degradation).toBeNull();
    });

    it("falls back to the mono bed when the browser downmixed to stereo", () => {
        const plan = planDecodedBuffers([buffer("spatial", 2), mono]);

        expect(plan.buffers).toEqual([mono]);
        expect(plan.degradation).toEqual({
            decodedChannels: 2,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            reason: "downmixed",
        });
    });

    it("falls back on a mono downmix too, not only stereo", () => {
        const plan = planDecodedBuffers([buffer("spatial", 1), mono]);

        expect(plan.buffers).toEqual([mono]);
        expect(plan.degradation?.reason).toBe("downmixed");
    });

    it("reports no-fallback when a collapsed spatial file is all there is", () => {
        const collapsed = buffer("spatial", 2);
        const plan = planDecodedBuffers([collapsed]);

        // Still played: something audible beats silence, and the caller is
        // told, which is the whole point.
        expect(plan.buffers).toEqual([collapsed]);
        expect(plan.degradation).toEqual({
            decodedChannels: 2,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            reason: "no-fallback",
        });
    });

    it("accepts more channels than expected rather than calling them broken", () => {
        const plan = planDecodedBuffers([buffer("spatial", 16), mono]);

        expect(plan.degradation).toBeNull();
    });

    it("leaves an empty decode for the merge step to reject", () => {
        const plan = planDecodedBuffers([]);

        expect(plan.buffers).toEqual([]);
        expect(plan.degradation).toBeNull();
    });
});
