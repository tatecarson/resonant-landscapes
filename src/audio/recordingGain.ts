/**
 * Per-recording level, so every park is heard at about the same loudness.
 *
 * A field test (rl-edv.4) found a listening spot quiet at its centre with the
 * phone at full volume. The recordings were the cause: what reached the
 * speaker spanned about 45 dB across the corpus, from -71 LUFS up to -26, and
 * Palisades, one of the parks that was easy to hear, came out near -37, some
 * 20 dB under ordinary phone media. In the quietest
 * recordings most of the energy is rumble below 200 Hz, which a phone speaker
 * cannot play, and the rumble's peaks were what stopped anything louder.
 *
 * So each recording goes through the same high-pass on every channel, which
 * removes the rumble without touching the spatial image, then one gain that
 * brings its binaural output to TARGET_LUFS. The measurements are rendered by
 * scripts/measure-recording-loudness.mjs through this filter and the real
 * scene; this module owns the policy, so it can be tuned and tested without
 * re-measuring.
 */
import loudnessTable from "../data/recordingLoudness.json";
import { LIMITER_SETTINGS, MASTER_GAIN } from "./audioGraph";

/** Two cascaded Butterworth stages at 80 Hz: 24 dB/octave below it. */
export const HIGHPASS_HZ = 80;
export const HIGHPASS_STAGES = 2;
export const HIGHPASS_Q = Math.SQRT1_2;

/**
 * Integrated loudness every recording is brought to at the speaker, after
 * master gain: EBU R128's broadcast level. That is about 14 dB above where
 * Palisades sat before, and still leaves the median recording's p99.99 level
 * near -9 dBFS. It is the one number to change after a field listen.
 */
export const TARGET_LUFS = -23;

const MASTER_GAIN_DB = 20 * Math.log10(MASTER_GAIN);

/**
 * No recording's p99.99 output level may be pushed past the limiter's
 * threshold, so what the limiter catches is the rare transient the
 * percentile leaves out, not the recording itself.
 */
export const PEAK_CEILING_DB = LIMITER_SETTINGS.threshold;

/**
 * The most the limiter may have to take off any single transient. A close
 * birdcall or a handling bump can sit 50 dB above the ambience around it,
 * and levelling the ambience would otherwise slam the limiter by 10 dB or
 * more: an audible duck for its 150 ms release, and a few milliseconds of
 * clipping while its 5 ms attack catches up. Four recordings are held a few
 * dB under the target by this rather than pumped.
 */
export const MAX_LIMITING_DB = 6;

/**
 * The quietest recordings would need up to 50 dB. Past this, their noise
 * floor rises with them, and a quiet place is allowed to stay a little
 * quieter: those end up near -31 LUFS rather than -72.
 */
export const MAX_BOOST_DB = 40;

/** Binaural output at a park's centre, after the high-pass, before master gain. */
export type RecordingLoudness = {
    /** EBU R128 integrated loudness. */
    outLufs: number;
    /** Sample peak. */
    peakDb: number;
    /** The level only 0.01% of samples exceed. */
    p9999Db: number;
};

type LoudnessTable = {
    highpassHz: number;
    highpassStages: number;
    recordings: Record<string, RecordingLoudness>;
};

const table = loudnessTable as LoudnessTable;

/** Gain in dB for one measured recording, under the policy above. */
export function gainDbFor(loudness: RecordingLoudness): number {
    return Math.min(
        TARGET_LUFS - MASTER_GAIN_DB - loudness.outLufs,
        PEAK_CEILING_DB - MASTER_GAIN_DB - loudness.p9999Db,
        PEAK_CEILING_DB + MAX_LIMITING_DB - MASTER_GAIN_DB - loudness.peakDb,
        MAX_BOOST_DB,
    );
}

/** Where a measured recording lands at the speaker, before the limiter. */
export function speakerLufsFor(loudness: RecordingLoudness): number {
    return loudness.outLufs + gainDbFor(loudness) + MASTER_GAIN_DB;
}

/**
 * "Custer-State-3-001" from any of a recording's delivery URLs: the 8ch file
 * in either family, its ninth component, or the W fallback.
 */
export function recordingBaseFromUrl(url: string): string | null {
    const match = url.match(/\/([A-Za-z0-9-]+?)_(?:8ch|mono|w)\.(?:m4a|flac|wav)$/);
    return match ? match[1] : null;
}

export function dbToLinear(db: number): number {
    return 10 ** (db / 20);
}

/**
 * Linear gain for the recording a set of delivery URLs loads. A recording
 * missing from the table plays unchanged: quieter than its neighbours, which
 * is how everything played before this, rather than silent or clipped.
 *
 * The table is measured on the nine-channel soundfield path. The W-only
 * fallback, for a browser that cannot keep eight channels, takes the same
 * gain through a point source; its absolute level is unmeasured, but the
 * gain still ranks the recordings the same way.
 */
export function recordingGainFor(
    urls: readonly string[],
    recordings: Record<string, RecordingLoudness> = table.recordings,
): number {
    const base = urls.length ? recordingBaseFromUrl(urls[0]) : null;
    const loudness = base ? recordings[base] : undefined;
    return loudness ? dbToLinear(gainDbFor(loudness)) : 1;
}

export type RecordingHighpass = {
    input: AudioNode;
    output: AudioNode;
    disconnect: () => void;
};

/**
 * The high-pass, for a buffer of `channelCount` channels. Explicit and
 * discrete like the rest of the soundfield path, so nine ambisonic channels
 * are filtered as nine channels and never up- or down-mixed on the way.
 */
export function createRecordingHighpass(
    context: BaseAudioContext,
    channelCount: number,
): RecordingHighpass {
    const stages = Array.from({ length: HIGHPASS_STAGES }, () => {
        const filter = context.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = HIGHPASS_HZ;
        filter.Q.value = HIGHPASS_Q;
        filter.channelCount = channelCount;
        filter.channelCountMode = "explicit";
        filter.channelInterpretation = "discrete";
        return filter;
    });
    for (let index = 1; index < stages.length; index += 1) {
        stages[index - 1].connect(stages[index]);
    }
    return {
        input: stages[0],
        output: stages[stages.length - 1],
        disconnect: () => {
            for (const stage of stages) stage.disconnect();
        },
    };
}

/** The filter settings the table was measured through. */
export const measuredHighpass = {
    hz: table.highpassHz,
    stages: table.highpassStages,
} as const;
