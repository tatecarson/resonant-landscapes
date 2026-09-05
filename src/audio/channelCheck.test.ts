import { describe, expect, it } from "vitest";
import {
    EXPECTED_SPATIAL_CHANNELS,
    planDecodedBuffers,
    shouldSurfaceDegradation,
    type SpatialDegradation,
} from "./channelCheck";

const buffer = (
    name: string,
    numberOfChannels: number,
    { length = 2_646_000, sampleRate = 44_100 } = {}
) => ({ name, numberOfChannels, length, sampleRate }) as unknown as AudioBuffer;

const spatial = buffer("spatial", EXPECTED_SPATIAL_CHANNELS);
const mono = buffer("mono", 1);

describe("planDecodedBuffers", () => {
    it("merges everything when the spatial file decoded to 8 channels", () => {
        const plan = planDecodedBuffers([spatial, mono]);

        expect(plan.buffers).toEqual([spatial, mono]);
        expect(plan.degradation).toBeNull();
    });

    it("requires a separate fallback when the browser downmixed to stereo", () => {
        const plan = planDecodedBuffers([buffer("spatial", 2), mono]);

        expect(plan.buffers).toEqual([]);
        expect(plan.degradation).toEqual({
            decodedChannels: 2,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            cause: "downmix",
            reason: "downmixed",
        });
    });

    it("requires a separate fallback for a mono downmix too", () => {
        const plan = planDecodedBuffers([buffer("spatial", 1), mono]);

        expect(plan.buffers).toEqual([]);
        expect(plan.degradation?.reason).toBe("downmixed");
    });

    it("reports no-fallback when a collapsed spatial file is all there is", () => {
        const collapsed = buffer("spatial", 2);
        const plan = planDecodedBuffers([collapsed]);

        // A collapsed stream is never treated as valid ambisonics.
        expect(plan.buffers).toEqual([]);
        expect(plan.degradation).toEqual({
            decodedChannels: 2,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            cause: "downmix",
            reason: "no-fallback",
        });
    });

    it("accepts more channels than expected rather than calling them broken", () => {
        const plan = planDecodedBuffers([buffer("spatial", 16), mono]);

        expect(plan.degradation).toBeNull();
    });

    /**
     * rl-74x.5. The pair is two halves of one recording, so files that
     * disagree about it cannot be merged — mergeBuffersByChannel throws
     * rather than truncate, because lining them up anyway offsets channels
     * against each other. Nothing caught that throw, so one bad file on the
     * CDN failed the park outright. Live today: Good-Earth-2-001's 8ch file
     * is 58.33 s against its 60.00 s counterpart (rl-74x.1).
     */
    it("degrades a pair that disagrees on length instead of failing the park", () => {
        const plan = planDecodedBuffers([
            spatial,
            buffer("mono", 1, { length: 2_572_353 }),
        ]);

        expect(plan.buffers).toEqual([]);
        expect(plan.degradation).toEqual({
            // The spatial file is fine. Saying it decoded to 8 of an expected
            // 8 and still degraded is only coherent because of `cause`.
            decodedChannels: EXPECTED_SPATIAL_CHANNELS,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            cause: "pair-mismatch",
            reason: "downmixed",
        });
    });

    it("degrades a pair that disagrees on sample rate too", () => {
        const plan = planDecodedBuffers([
            spatial,
            buffer("mono", 1, { sampleRate: 48_000 }),
        ]);

        expect(plan.degradation?.cause).toBe("pair-mismatch");
    });

    it("does not blame the browser for a file the CDN got wrong", () => {
        // The distinction the strip and the debug panel are read through: a
        // downmix is the engine's doing and applies to every park, a
        // mismatched pair is one payload. Reporting the second as the first
        // sends whoever reads it looking at the wrong layer.
        const downmix = planDecodedBuffers([buffer("spatial", 2), mono]);
        const mismatch = planDecodedBuffers([
            spatial,
            buffer("mono", 1, { length: 1 }),
        ]);

        expect(downmix.degradation?.cause).toBe("downmix");
        expect(mismatch.degradation?.cause).toBe("pair-mismatch");
    });

    it("never offers the legacy mono component as the thing to play", () => {
        // The file named "mono" is source component 8, not a downmix
        // (rl-dqc.7). A degraded plan therefore carries no buffers at all:
        // the loader has to go and fetch the verified W mix. Passing the
        // pair through here would play one ambisonic component as if it
        // were a mix, which is wrong rather than merely lesser.
        const plan = planDecodedBuffers([
            spatial,
            buffer("mono", 1, { length: 1 }),
        ]);

        expect(plan.buffers).toEqual([]);
        expect(plan.buffers).not.toContain(mono);
    });

    it("leaves an empty decode for the merge step to reject", () => {
        const plan = planDecodedBuffers([]);

        expect(plan.buffers).toEqual([]);
        expect(plan.degradation).toBeNull();
    });
});

describe("shouldSurfaceDegradation", () => {
    const downmixed: SpatialDegradation = {
        decodedChannels: 2,
        expectedChannels: EXPECTED_SPATIAL_CHANNELS,
        cause: "downmix",
        reason: "downmixed",
    };
    const noFallback: SpatialDegradation = { ...downmixed, reason: "no-fallback" };

    it("shows a downmix even when a prefetch reported it", () => {
        // The browser collapses every park, so which load noticed is irrelevant.
        expect(shouldSurfaceDegradation(downmixed, "prefetched-park", "active-park")).toBe(true);
    });

    it("shows a downmix when nothing is active yet", () => {
        expect(shouldSurfaceDegradation(downmixed, "prefetched-park", null)).toBe(true);
    });

    it("hides a prefetched park's missing plain mix", () => {
        // The bug this exists to stop: "this park has no plain mix" over a
        // park that has one, because a different park was being fetched.
        expect(shouldSurfaceDegradation(noFallback, "prefetched-park", "active-park")).toBe(false);
    });

    it("shows the active park's missing plain mix", () => {
        expect(shouldSurfaceDegradation(noFallback, "active-park", "active-park")).toBe(true);
    });

    it("hides a missing plain mix when no park is active", () => {
        expect(shouldSurfaceDegradation(noFallback, "some-park", null)).toBe(false);
    });
});
