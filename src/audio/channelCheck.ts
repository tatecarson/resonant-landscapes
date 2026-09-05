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
     * What went wrong with the payload, as opposed to what was done about it.
     *
     * `downmix`: the browser collapsed the spatial stream, so decodedChannels
     * is below expectedChannels and says by how much.
     *
     * `pair-mismatch`: the spatial file decoded to the right number of
     * channels, but the delivery's two files disagree on length or sample
     * rate and cannot be merged (rl-74x.5). decodedChannels and
     * expectedChannels are then equal, which is why this field exists: a
     * report that said only "downmixed" would blame the browser for a
     * mismatched pair on the CDN and send whoever reads it looking in the
     * wrong place.
     */
    cause: "downmix" | "pair-mismatch";
    /**
     * `downmixed`: we fell back to a separately verified W file.
     * `no-fallback`: that file is unavailable, so the caller must report an
     * error and stop the load.
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
 * Whether these buffers can be concatenated channel-wise at all.
 *
 * mergeBuffersByChannel requires one length and one sample rate across the
 * whole list, and it is right to: the delivery's files are two halves of one
 * recording, so a disagreement means they are not describing the same take,
 * and lining them up anyway offsets channels against each other. Asked here
 * rather than discovered there, so a bad pair becomes a degraded park instead
 * of a thrown error.
 *
 * Live example: the CDN's Good-Earth-2-001 8ch FLAC is 58.33 s against its
 * 60.00 s counterpart (rl-74x.1). Fixing that one file removes today's
 * instance and none of the class — any re-encode or partial upload puts
 * another one back.
 */
function canMerge(decoded: AudioBuffer[]): boolean {
    const [first] = decoded;
    return decoded.every(
        (buffer) =>
            buffer.length === first.length && buffer.sampleRate === first.sampleRate
    );
}

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
 * A pair that cannot be merged is decided here too. It used to be left to
 * mergeBuffersByChannel, which throws — correctly, since truncating to the
 * shorter file would put a channel offset into spatial audio — but nothing
 * caught the throw, so one bad file on the CDN failed the park outright
 * rather than degrading it (rl-74x.5). The recording is still unplayable as
 * a soundfield; the difference is that the walker now hears the W mix and is
 * told, instead of standing in a park with an error on the strip.
 */
export function planDecodedBuffers(decoded: AudioBuffer[]): ChannelPlan {
    const [spatial] = decoded;

    // Nothing decoded: let mergeBuffersByChannel raise its own error rather
    // than inventing a second message for the same condition.
    if (!spatial) {
        return { buffers: decoded, degradation: null };
    }

    if (spatial.numberOfChannels >= EXPECTED_SPATIAL_CHANNELS) {
        if (!canMerge(decoded)) {
            return {
                buffers: [],
                degradation: {
                    // The spatial file is intact; the pair is not. Both counts
                    // are the truth about this payload, and `cause` is what
                    // stops the pair of them reading as a browser downmix.
                    decodedChannels: spatial.numberOfChannels,
                    expectedChannels: EXPECTED_SPATIAL_CHANNELS,
                    cause: "pair-mismatch",
                    // Provisional, as in the downmix branch below: the loader
                    // settles this once it knows whether the W mix arrived.
                    reason: "downmixed",
                },
            };
        }
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
                cause: "downmix",
                reason: "no-fallback",
            },
        };
    }

    return {
        buffers: [],
        degradation: {
            decodedChannels,
            expectedChannels: EXPECTED_SPATIAL_CHANNELS,
            cause: "downmix",
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
