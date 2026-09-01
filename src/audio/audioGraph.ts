/**
 * The output chain every park is heard through, and the silent node that
 * makes the first one audible.
 *
 * This lived inline in the provider's init effect, where the master gain and
 * the limiter were four anonymous numbers in the middle of forty lines of
 * ResonanceAudio setup. Pulled out, the tuning is named, the wiring order is
 * one readable line, and both halves can be tested without a React tree.
 */

/**
 * ~+3 dB, so park center is perceptibly louder on a phone speaker. The
 * limiter below catches whatever this pushes above -1 dBFS.
 */
export const MASTER_GAIN = 1.413;

/**
 * Safety limiter: peaks only, so the master-gain bump or an unusually hot
 * park recording cannot clip mobile speakers. Field recordings must keep
 * their dynamic range, so this has to stay effectively inaudible on the
 * natural signal — that is what the -1 dB threshold and zero knee buy.
 */
export const LIMITER_SETTINGS = {
    threshold: -1,
    knee: 0,
    ratio: 20,
    attack: 0.005,
    release: 0.15,
} as const;

export interface AudioOutputChain {
    /** Connect the spatial scene's output here. */
    input: AudioNode;
    masterGain: GainNode;
    limiter: DynamicsCompressorNode;
    /** Tear the chain down, leaving the context's destination untouched. */
    disconnect: () => void;
}

/**
 * Build scene → master gain → limiter → destination and return the head of
 * it. The caller owns the scene, so connecting it is left to the caller
 * rather than passing a ResonanceAudio in here for one property.
 */
export function createAudioGraph(context: BaseAudioContext): AudioOutputChain {
    const masterGain = context.createGain();
    masterGain.gain.value = MASTER_GAIN;

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_SETTINGS.threshold;
    limiter.knee.value = LIMITER_SETTINGS.knee;
    limiter.ratio.value = LIMITER_SETTINGS.ratio;
    limiter.attack.value = LIMITER_SETTINGS.attack;
    limiter.release.value = LIMITER_SETTINGS.release;

    masterGain.connect(limiter);
    limiter.connect(context.destination);

    return {
        input: masterGain,
        masterGain,
        limiter,
        disconnect: () => {
            masterGain.disconnect();
            limiter.disconnect();
        },
    };
}

/**
 * Play one silent sample inside the unlock gesture.
 *
 * iOS keeps an AudioContext functionally mute until something has actually
 * been played through it from a user gesture; resuming the context alone is
 * not enough. The node is built, started and stopped within a millisecond,
 * and disconnects itself.
 *
 * Idempotence is the caller's business — this runs once per context, and the
 * provider holds that flag.
 */
export function primeAudioContext(context: BaseAudioContext): void {
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    silentGain.connect(context.destination);

    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(silentGain);
    source.onended = () => {
        source.disconnect();
        silentGain.disconnect();
    };
    source.start(0);
    source.stop(context.currentTime + 0.001);
}
