import { describe, expect, it } from "vitest";
import stateParks from "../data/stateParks.json";
import loudnessTable from "../data/recordingLoudness.json";
import { getMonoFallbackUrl, getParkAudioVariants } from "../utils/audioPaths";
import { LIMITER_SETTINGS, MASTER_GAIN } from "./audioGraph";
import {
    HIGHPASS_HZ,
    HIGHPASS_Q,
    HIGHPASS_STAGES,
    MAX_BOOST_DB,
    MAX_LIMITING_DB,
    PEAK_CEILING_DB,
    TARGET_LUFS,
    createRecordingHighpass,
    dbToLinear,
    gainDbFor,
    measuredHighpass,
    recordingBaseFromUrl,
    recordingGainFor,
    speakerLufsFor,
    type RecordingLoudness,
} from "./recordingGain";

const recordings = (loudnessTable as { recordings: Record<string, RecordingLoudness> }).recordings;
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME = "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile Safari/537.36";
const MASTER_GAIN_DB = 20 * Math.log10(MASTER_GAIN);

describe("gainDbFor", () => {
    it("brings a recording with headroom to the target at the speaker", () => {
        const loudness = { outLufs: -50, peakDb: -30, p9999Db: -35 };
        expect(gainDbFor(loudness)).toBeCloseTo(TARGET_LUFS - MASTER_GAIN_DB + 50, 10);
        expect(speakerLufsFor(loudness)).toBeCloseTo(TARGET_LUFS, 10);
    });

    it("turns a recording louder than the target down", () => {
        expect(gainDbFor({ outLufs: -15, peakDb: -3, p9999Db: -6 })).toBeLessThan(0);
    });

    it("stops where the p99.99 level would reach the limiter", () => {
        const loudness = { outLufs: -60, peakDb: -9, p9999Db: -11 };
        expect(gainDbFor(loudness)).toBeCloseTo(PEAK_CEILING_DB - MASTER_GAIN_DB + 11, 10);
        expect(speakerLufsFor(loudness)).toBeLessThan(TARGET_LUFS);
    });

    it("never asks the limiter to take more than its allowance off a transient", () => {
        const loudness = { outLufs: -60, peakDb: -5, p9999Db: -40 };
        expect(gainDbFor(loudness)).toBeCloseTo(PEAK_CEILING_DB + MAX_LIMITING_DB - MASTER_GAIN_DB + 5, 10);
    });

    it("never boosts past the cap, however quiet the recording", () => {
        expect(gainDbFor({ outLufs: -90, peakDb: -70, p9999Db: -75 })).toBe(MAX_BOOST_DB);
    });
});

describe("recordingBaseFromUrl", () => {
    it("reads the recording from every delivery URL of both families", () => {
        for (const userAgent of [SAFARI, CHROME]) {
            const [variant] = getParkAudioVariants("Custer State Park", stateParks, userAgent) ?? [];
            expect(variant.map(recordingBaseFromUrl)).toEqual(["Custer-State-1-001", "Custer-State-1-001"]);
            expect(recordingBaseFromUrl(getMonoFallbackUrl(variant[0]) ?? "")).toBe("Custer-State-1-001");
        }
    });

    it("rejects a URL that is not a recording", () => {
        expect(recordingBaseFromUrl("https://resonant-landscapes.b-cdn.net/manifest.json")).toBeNull();
    });
});

describe("recordingGainFor", () => {
    it("returns the linear gain for the recording the URLs load", () => {
        const [variant] = getParkAudioVariants("Bear Butte State Park", stateParks, SAFARI) ?? [];
        expect(recordingGainFor(variant)).toBeCloseTo(dbToLinear(gainDbFor(recordings["Bear-Butte-1-001"])), 10);
    });

    it("plays an unmeasured recording unchanged", () => {
        expect(recordingGainFor(["https://resonant-landscapes.b-cdn.net/sounds/Nowhere-1-001_8ch.m4a"])).toBe(1);
        expect(recordingGainFor([])).toBe(1);
    });
});

describe("the measured table", () => {
    it("was measured through the filter the app plays through", () => {
        expect(measuredHighpass).toEqual({ hz: HIGHPASS_HZ, stages: HIGHPASS_STAGES });
    });

    it("covers every recording a walker can be served", () => {
        const missing = stateParks
            .flatMap((park) => getParkAudioVariants(park.name, stateParks, SAFARI) ?? [])
            .map((variant) => recordingBaseFromUrl(variant[0]))
            .filter((base) => !base || !recordings[base]);
        expect(missing).toEqual([]);
    });

    it("levels the corpus: 85% of recordings land within 3 dB of the target", () => {
        const levelled = Object.values(recordings).map(speakerLufsFor);
        const near = levelled.filter((lufs) => Math.abs(lufs - TARGET_LUFS) <= 3);
        expect(near.length / levelled.length).toBeGreaterThanOrEqual(0.85);
        expect(Math.max(...levelled)).toBeLessThanOrEqual(TARGET_LUFS + 1e-9);
    });

    it("leaves no recording as quiet as the quietest used to be", () => {
        // Before levelling the quietest parks came out below -70 LUFS.
        expect(Math.min(...Object.values(recordings).map(speakerLufsFor))).toBeGreaterThan(TARGET_LUFS - 10);
    });

    it("keeps every recording's p99.99 level under the limiter, and its peak within the allowance", () => {
        expect(PEAK_CEILING_DB).toBe(LIMITER_SETTINGS.threshold);
        for (const r of Object.values(recordings)) {
            const gain = gainDbFor(r) + MASTER_GAIN_DB;
            expect(r.p9999Db + gain).toBeLessThanOrEqual(PEAK_CEILING_DB + 1e-9);
            expect(r.peakDb + gain).toBeLessThanOrEqual(PEAK_CEILING_DB + MAX_LIMITING_DB + 1e-9);
        }
    });
});

describe("createRecordingHighpass", () => {
    type FakeFilter = {
        type: string;
        frequency: { value: number };
        Q: { value: number };
        channelCount: number;
        channelCountMode: string;
        channelInterpretation: string;
        connectedTo: FakeFilter[];
        disconnected: boolean;
        connect: (target: FakeFilter) => void;
        disconnect: () => void;
    };

    function fakeContext() {
        const filters: FakeFilter[] = [];
        const context = {
            createBiquadFilter: () => {
                const filter: FakeFilter = {
                    type: "lowpass",
                    frequency: { value: 350 },
                    Q: { value: 1 },
                    channelCount: 2,
                    channelCountMode: "max",
                    channelInterpretation: "speakers",
                    connectedTo: [],
                    disconnected: false,
                    connect: (target) => {
                        filter.connectedTo.push(target);
                    },
                    disconnect: () => {
                        filter.disconnected = true;
                    },
                };
                filters.push(filter);
                return filter;
            },
        };
        return { context: context as unknown as BaseAudioContext, filters };
    }

    it("chains Butterworth high-pass stages over all nine channels, discretely", () => {
        const { context, filters } = fakeContext();
        const highpass = createRecordingHighpass(context, 9);

        expect(filters).toHaveLength(HIGHPASS_STAGES);
        for (const filter of filters) {
            expect(filter).toMatchObject({
                type: "highpass",
                frequency: { value: HIGHPASS_HZ },
                Q: { value: HIGHPASS_Q },
                channelCount: 9,
                channelCountMode: "explicit",
                channelInterpretation: "discrete",
            });
        }
        expect(filters[0].connectedTo).toEqual([filters[1]]);
        expect(highpass.input).toBe(filters[0]);
        expect(highpass.output).toBe(filters[filters.length - 1]);
    });

    it("disconnects every stage", () => {
        const { context, filters } = fakeContext();
        createRecordingHighpass(context, 1).disconnect();
        expect(filters.every((filter) => filter.disconnected)).toBe(true);
    });
});
