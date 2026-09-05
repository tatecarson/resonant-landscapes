/**
 * How many channels the spatial file must decode to for the HOA field to be
 * real. The delivery consists of an 8-channel file plus a mono file;
 * mergeDeliveryBuffers restores their original nine-channel order.
 *
 * Channel index 2 decodes digitally silent in every delivery file, measured 2026-09-04
 * by the corpus audit (rl-2v0): all 204 eight-channel files, both families, zero
 * nonzero samples. rl-dqc.7 recovered the export permutation and confirmed it
 * against surviving nine-channel excerpts in both families. Delivery channels
 * [0,1,2,3,4,5,6,7] contain source [0,1,6,7,4,5,2,3]; the "mono" file is source 8.
 * Thus delivery index 2 is the source's silent index 6, and height at source
 * index 2 survives at delivery index 6. See docs/audio-channel-correlation.json.
 * This establishes ordering; it does not verify encoder calibration or the
 * playback graph. The "mono" file is not a verified plain mix for fallback.
 */
export const EXPECTED_SPATIAL_CHANNELS = 8;

export type SpatialDegradation = {
    /** What decodeAudioData actually returned for the spatial file. */
    decodedChannels: number;
    expectedChannels: number;
    /**
     * `downmixed`: the browser collapsed the spatial stream and we fell back
     * to a separately verified W file. `no-fallback`: that file is unavailable,
     * so the caller must report an error and stop the load.
     */
    reason: "downmixed" | "no-fallback";
};

export type ChannelPlan = {
    /** The buffers to merge, in order. */
    buffers: AudioBuffer[];
    /** Null when the decode is intact. */
    degradation: SpatialDegradation | null;
};

/**
 * Decide what to actually merge, given what the browser handed back.
 *
 * Eight discrete components are required before restoring the ninth component.
 * A downmixed spatial stream cannot be reconstructed by channel concatenation.
 *
 * Never pass the legacy file named "mono" through as a fallback: it carries
 * source component 8. A degraded plan has no playable buffers. The loader must
 * fetch a separately exported W mix or report a load error (rl-dqc.9).
 *
 * Buffers beyond the first two are passed through untouched; the merge step
 * validates length and sample rate and is the right place for those failures.
 */
export function planDecodedBuffers(decoded: AudioBuffer[]): ChannelPlan {
    const [spatial] = decoded;

    // Nothing decoded: let mergeBuffersByChannel raise its own error rather
    // than inventing a second message for the same condition.
    if (!spatial) {
        return { buffers: decoded, degradation: null };
    }

    if (spatial.numberOfChannels >= EXPECTED_SPATIAL_CHANNELS) {
        return { buffers: decoded, degradation: null };
    }

    const decodedChannels = spatial.numberOfChannels;
    const fallback = decoded.slice(1);

    if (fallback.length === 0) {
        return {
            buffers: [],
            degradation: {
                decodedChannels,
                expectedChannels: EXPECTED_SPATIAL_CHANNELS,
                reason: "no-fallback",
            },
        };
    }

    return {
        buffers: [],
        degradation: {
            decodedChannels,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            reason: "downmixed",
        },
    };
}

/**
 * Whether a degradation report belongs to the park the walker is in.
 *
 * The two reasons have different scopes and the difference is easy to lose:
 *
 * - `downmixed` is a fact about the browser. An engine that collapses one
 *   park's 8-channel file collapses every park's, so it applies everywhere and
 *   should stick once seen, including across cache hits that never re-report.
 * - `no-fallback` is a fact about one payload. Prefetch loads a park the
 *   walker has not reached, so crediting its report to the active park would
 *   claim "this park has no plain mix" over a park that has one.
 *
 */
export function shouldSurfaceDegradation(
    degradation: SpatialDegradation,
    cacheKey: string,
    activeCacheKey: string | null
): boolean {
    if (degradation.reason === "downmixed") return true;
    return cacheKey === activeCacheKey;
}
