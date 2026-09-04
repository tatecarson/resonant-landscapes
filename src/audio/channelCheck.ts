/**
 * How many channels the spatial file must decode to for the HOA field to be
 * real. Third-order ambisonics in ACN/SN3D is 16 channels; these recordings
 * are the 8-channel subset the piece was authored in.
 *
 * Channel index 2 decodes digitally silent in every master — measured 2026-09-04
 * by the corpus audit (rl-2v0): all 204 eight-channel files, both families, zero
 * nonzero samples. That is the authoring convention of the subset, not an encode
 * step dropping a component (rl-6p5), so a level measurement reading 0.000 there
 * is expected and does not re-open the question. What would re-open it: any
 * other channel reading silence, or ch2 carrying signal.
 */
export const EXPECTED_SPATIAL_CHANNELS = 8;

export type SpatialDegradation = {
    /** What decodeAudioData actually returned for the spatial file. */
    decodedChannels: number;
    expectedChannels: number;
    /**
     * `downmixed`: the browser collapsed the spatial stream and we fell back
     * to the mono bed. `no-fallback`: it collapsed and there was no mono file
     * to fall back to, so the caller is about to play a broken field.
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
 * The piece assumes `decodeAudioData` returns 8 discrete channels for the
 * spatial file, and browsers genuinely differ here — AudioContextProvider
 * already forces `channelInterpretation = 'discrete'` on the Resonance source
 * to defeat a Safari downmix at the graph level, but nothing checked the
 * decode itself. A browser that collapses the 8-channel stream to stereo
 * produces an app that still plays audio and still looks correct while the
 * spatial field is silently wrong, which is the worst failure this piece can
 * have: no error, no clue, just a walk that does not do the thing it is for.
 *
 * So verify, and prefer an honest downgrade. The park payload is
 * `[spatial, mono]`; dropping the collapsed spatial buffer leaves the mono bed,
 * which ResonanceAudio positions by distance and bearing — less than the piece
 * intends, but true, and the UI says so.
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
            buffers: decoded,
            degradation: {
                decodedChannels,
                expectedChannels: EXPECTED_SPATIAL_CHANNELS,
                reason: "no-fallback",
            },
        };
    }

    return {
        buffers: fallback,
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
 * Split out as a pure function rather than left inline in the provider,
 * because the no-fallback path cannot be reached from a test through the app:
 * every park payload is a spatial file plus a mono bed, so `planDecodedBuffers`
 * never returns it today. A rule that nothing can exercise is a rule that
 * quietly stops being true (rl-0p1).
 */
export function shouldSurfaceDegradation(
    degradation: SpatialDegradation,
    cacheKey: string,
    activeCacheKey: string | null
): boolean {
    if (degradation.reason === "downmixed") return true;
    return cacheKey === activeCacheKey;
}
