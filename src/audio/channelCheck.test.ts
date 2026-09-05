import { describe, expect, it } from "vitest";
import {
    EXPECTED_SPATIAL_CHANNELS,
    planDecodedBuffers,
    shouldSurfaceDegradation,
    type SpatialDegradation,
} from "./channelCheck";

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

    it("requires a separate fallback when the browser downmixed to stereo", () => {
        const plan = planDecodedBuffers([buffer("spatial", 2), mono]);

        expect(plan.buffers).toEqual([]);
        expect(plan.degradation).toEqual({
            decodedChannels: 2,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
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

describe("shouldSurfaceDegradation", () => {
    const downmixed: SpatialDegradation = {
        decodedChannels: 2,
        expectedChannels: EXPECTED_SPATIAL_CHANNELS,
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
