/**
 * Concatenate several AudioBuffers into one, channel by channel.
 *
 * The park payloads arrive as two files — an 8-channel HOA stream and a
 * 1-channel mono bed — and ResonanceAudio wants them as a single 9-channel
 * buffer. This was Omnitone.mergeBufferListByChannel, and it was the only
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
