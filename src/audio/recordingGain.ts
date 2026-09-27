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
import { AMBISONIC_ORDER, SOUNDFIELD_CHANNELS } from "./soundfield";

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

/**
 * How far the second-order components are turned down in a recording the
 * boost cap cannot bring to target. Those recordings are mostly noise floor,
 * and most of that floor is in the second order, 10 to 15 dB hotter than W
 * between 80 Hz and 1 kHz where a real soundfield would put it well below.
 * Lifting them 40 dB lifted that with them. Chosen by ear against a
 * per-order spectral denoiser, which cost the quiet recordings more of what
 * little they have; turning the second order down only softens how sharply
 * sounds are placed, and changes no direction, since it treats every
 * component of the order alike.
 *
 * Not applied more widely: in the recordings that are easy to hear, the
 * second order carries real sound (Palisades loses 3.4 dB without it).
 */
export const SECOND_ORDER_TURNDOWN_DB = -12;

/** ACN numbers each order n from n², so the second order starts at 4. */
const FIRST_SECOND_ORDER_CHANNEL = AMBISONIC_ORDER ** 2;

/** Binaural output at a park's centre, after the high-pass, before master gain. */
export type RecordingLoudness = {
    /** EBU R128 integrated loudness. */
    outLufs: number;
    /** Sample peak. */
    peakDb: number;
    /** The level only 0.01% of samples exceed. */
    p9999Db: number;
};

export type RecordingEntry = RecordingLoudness & {
    /** Measured again with the second order turned down, for the recordings that get it. */
    secondOrderTurnedDown?: RecordingLoudness;
};

type LoudnessTable = {
    highpassHz: number;
    highpassStages: number;
    secondOrderTurndownDb: number;
    recordings: Record<string, RecordingEntry>;
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

/**
 * The second-order gain a recording gets, decided on its untreated
 * measurement: turned down when even the full boost cannot reach the target.
 */
export function secondOrderGainDbFor(untreated: RecordingLoudness): number {
    return TARGET_LUFS - MASTER_GAIN_DB - untreated.outLufs > MAX_BOOST_DB
        ? SECOND_ORDER_TURNDOWN_DB
        : 0;
}

export type RecordingLevel = {
    gainDb: number;
    secondOrderGainDb: number;
    /** The measurement the gain was taken from. */
    loudness: RecordingLoudness;
};

/**
 * Both corrections for one recording. The gain comes from the measurement
 * that matches what plays: the turned-down one where the second order is
 * turned down. A table missing that measurement is stale; the turndown still
 * applies and the gain falls back to the untreated figures, which for these
 * recordings sits at the boost cap either way.
 */
export function levelFor(entry: RecordingEntry): RecordingLevel {
    const secondOrderGainDb = secondOrderGainDbFor(entry);
    const loudness = secondOrderGainDb && entry.secondOrderTurnedDown
        ? entry.secondOrderTurnedDown
        : entry;
    return { gainDb: gainDbFor(loudness), secondOrderGainDb, loudness };
}

/** Where a measured recording lands at the speaker, before the limiter. */
export function speakerLufsFor(entry: RecordingEntry): number {
    const { gainDb, loudness } = levelFor(entry);
    return loudness.outLufs + gainDb + MASTER_GAIN_DB;
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

export type PlaybackLevel = {
    /** Linear gain for the fade node to land on. */
    gain: number;
    secondOrderGainDb: number;
};

/**
 * Playback corrections for the recording a set of delivery URLs loads. A
 * recording missing from the table plays unchanged: quieter than its
 * neighbours, which is how everything played before this, rather than silent
 * or clipped.
 *
 * The table is measured on the nine-channel soundfield path. The W-only
 * fallback, for a browser that cannot keep eight channels, takes the same
 * gain through a point source; its absolute level is unmeasured, but the
 * gain still ranks the recordings the same way. It has no second order, so
 * the turndown does not reach it.
 */
export function playbackLevelFor(
    urls: readonly string[],
    recordings: Record<string, RecordingEntry> = table.recordings,
): PlaybackLevel {
    const base = urls.length ? recordingBaseFromUrl(urls[0]) : null;
    const entry = base ? recordings[base] : undefined;
    if (!entry) return { gain: 1, secondOrderGainDb: 0 };
    const { gainDb, secondOrderGainDb } = levelFor(entry);
    return { gain: dbToLinear(gainDb), secondOrderGainDb };
}

/** A node chain spliced into the playback path. */
export type RecordingStage = {
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
): RecordingStage {
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

/**
 * Scale the second-order components of a nine-channel soundfield by
 * `gainDb`, leaving W and the first order alone. Web Audio has no per-channel
 * gain, so the field is split, the five second-order channels each pass
 * through their own gain, and it is merged back in the same ACN order.
 */
export function createSecondOrderTrim(
    context: BaseAudioContext,
    gainDb: number,
): RecordingStage {
    const splitter = context.createChannelSplitter(SOUNDFIELD_CHANNELS);
    const merger = context.createChannelMerger(SOUNDFIELD_CHANNELS);
    merger.channelInterpretation = "discrete";
    const trims: GainNode[] = [];
    for (let channel = 0; channel < SOUNDFIELD_CHANNELS; channel += 1) {
        if (channel < FIRST_SECOND_ORDER_CHANNEL) {
            splitter.connect(merger, channel, channel);
            continue;
        }
        const trim = context.createGain();
        trim.gain.value = dbToLinear(gainDb);
        splitter.connect(trim, channel);
        trim.connect(merger, 0, channel);
        trims.push(trim);
    }
    return {
        input: splitter,
        output: merger,
        disconnect: () => {
            splitter.disconnect();
            for (const trim of trims) trim.disconnect();
            merger.disconnect();
        },
    };
}

/** The processing the table was measured through. */
export const measuredWith = {
    highpassHz: table.highpassHz,
    highpassStages: table.highpassStages,
    secondOrderTurndownDb: table.secondOrderTurndownDb,
} as const;
