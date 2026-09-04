/**
 * Concatenate several AudioBuffers into one, channel by channel.
 *
 * This utility preserves input order. Park delivery files need the additional
 * permutation in mergeDeliveryBuffers below. This was Omnitone.mergeBufferListByChannel,
 * and it was the only
 * thing left that the direct `omnitone` dependency did: fetching and decoding
 * are plain fetch/decodeAudioData now. Dropping that import removes a second
 * copy of Omnitone from the bundle, base64 HRIR tables and all —
 * resonance-audio already bundles its own.
 *
 * The validation is deliberately as strict as Omnitone's: a length or sample
 * rate mismatch means the two files disagree about the recording, and
 * silently truncating to the shorter one would put a channel offset into
 * spatial audio, which is audible only as "the park sounds wrong".
 */
export function mergeBuffersByChannel(
    context: BaseAudioContext,
    bufferList: AudioBuffer[]
): AudioBuffer {
    if (bufferList.length === 0) {
        throw new Error("mergeBuffersByChannel: no buffers to merge.");
    }

    const bufferLength = bufferList[0].length;
    const bufferSampleRate = bufferList[0].sampleRate;
    let totalChannels = 0;

    for (const buffer of bufferList) {
        if (buffer.length !== bufferLength) {
            throw new Error(
                `mergeBuffersByChannel: AudioBuffer lengths are inconsistent. (expected ${bufferLength} but got ${buffer.length})`
            );
        }
        if (buffer.sampleRate !== bufferSampleRate) {
            throw new Error(
                `mergeBuffersByChannel: AudioBuffer sample rates are inconsistent. (expected ${bufferSampleRate} but got ${buffer.sampleRate})`
            );
        }
        totalChannels += buffer.numberOfChannels;
    }

    if (totalChannels > 32) {
        throw new Error(
            `mergeBuffersByChannel: number of channels cannot exceed 32. (got ${totalChannels})`
        );
    }

    const merged = context.createBuffer(totalChannels, bufferLength, bufferSampleRate);
    let destinationChannel = 0;

    for (const buffer of bufferList) {
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            merged.getChannelData(destinationChannel).set(buffer.getChannelData(channel));
            destinationChannel += 1;
        }
    }

    return merged;
}

/**
 * Restore the nine source channels from the legacy delivery pair.
 *
 * The archived extract_channels.sh exported source [0,1,6,7,4,5,2,3]
 * to the eight-channel file and source 8 to the file named "mono".
 * Sample correlation confirms this in both delivery families (rl-dqc.7;
 * docs/audio-channel-correlation.json). The latter file is a spatial component,
 * not an omnidirectional mix. Silence at delivery index 2 belongs at source 6.
 *
 * Single-buffer degradation paths retain their existing behavior. Correct
 * soundfield routing and replacement of the mislabeled fallback are tracked
 * separately; restoring order alone does not fix the mono-source encoder.
 */
export function mergeDeliveryBuffers(
    context: BaseAudioContext,
    bufferList: AudioBuffer[]
): AudioBuffer {
    const merged = mergeBuffersByChannel(context, bufferList);
    if (bufferList.length !== 2 || bufferList[0].numberOfChannels !== 8 ||
        bufferList[1].numberOfChannels !== 1) return merged;

    // This permutation is its own inverse. Swap in place to avoid allocating
    // another full nine-channel, sixty-second buffer on a phone.
    for (const [a, b] of [[2, 6], [3, 7]]) {
        const first = merged.getChannelData(a);
        const second = merged.getChannelData(b);
        for (let i = 0; i < merged.length; i += 1) {
            const sample = first[i];
            first[i] = second[i];
            second[i] = sample;
        }
    }
    return merged;
}
