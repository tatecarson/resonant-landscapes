/**
 * How many channels the spatial file must decode to for the HOA field to be
 * real. Third-order ambisonics in ACN/SN3D is 16 channels; these recordings
 * are the 8-channel subset the piece was authored in.
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
