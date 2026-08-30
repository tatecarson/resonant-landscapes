import { describe, expect, it } from "vitest";
import { readPreflightEnv, runPreflight, type PreflightEnv } from "./capabilities";

const capable = (overrides: Partial<PreflightEnv> = {}): PreflightEnv => ({
    isPhone: true,
    audioContextCtor: function AudioContext() {},
    decodeAudioData: function decodeAudioData() {},
    geolocation: {},
    deviceOrientationEvent: function DeviceOrientationEvent() {},
    orientationRequestPermission: undefined,
    ...overrides,
});

const problemIds = (env: PreflightEnv) =>
    runPreflight(env).problems.map((check) => check.id);

describe("runPreflight", () => {
    it("passes a browser that has everything", () => {
        const preflight = runPreflight(capable());

        expect(preflight.verdict).toBe("ok");
        expect(preflight.problems).toEqual([]);
    });

    it("blocks when there is no Web Audio at all", () => {
        const preflight = runPreflight(capable({ audioContextCtor: undefined }));

        expect(preflight.verdict).toBe("blocked");
    });

    it("does not also blame decoding when the AudioContext itself is missing", () => {
        // Two lines saying "no audio here" reads as two faults; it is one.
        expect(problemIds(capable({ audioContextCtor: undefined, decodeAudioData: undefined })))
            .toEqual(["audio"]);
    });

    it("blocks on an AudioContext that cannot decode", () => {
        const preflight = runPreflight(capable({ decodeAudioData: undefined }));

        expect(preflight.verdict).toBe("blocked");
        expect(problemIds(capable({ decodeAudioData: undefined }))).toEqual(["decode"]);
    });

    it("blocks without geolocation, which is what picks the park", () => {
        const preflight = runPreflight(capable({ geolocation: undefined }));

        expect(preflight.verdict).toBe("blocked");
        expect(problemIds(capable({ geolocation: undefined }))).toEqual(["geolocation"]);
    });

    it("only degrades when orientation is missing, since the walk still works", () => {
        const preflight = runPreflight(capable({ deviceOrientationEvent: undefined }));

        expect(preflight.verdict).toBe("partial");
        expect(preflight.problems.map((check) => check.id)).toEqual(["orientation"]);
    });

    it("tells a desktop visitor this is a phone piece, without blocking them", () => {
        const preflight = runPreflight(capable({ isPhone: false }));

        // Non-essential on purpose: the mocked desk replays run here, and
        // refusing to draw the map would break the way this gets developed.
        expect(preflight.verdict).toBe("partial");
        expect(preflight.problems.map((check) => check.id)).toEqual(["phone"]);
    });

    it("reports the iOS permission prompt without calling it a problem", () => {
        const preflight = runPreflight(
            capable({ orientationRequestPermission: function requestPermission() {} })
        );

        expect(preflight.orientationNeedsPermission).toBe(true);
        expect(preflight.verdict).toBe("ok");
    });
});

describe("readPreflightEnv", () => {
    it("accepts the prefixed webkitAudioContext", () => {
        class WebkitAudioContext {
            decodeAudioData() {}
        }

        const env = readPreflightEnv({
            webkitAudioContext: WebkitAudioContext,
            navigator: { geolocation: {}, userAgent: "iPhone" },
            DeviceOrientationEvent: function DeviceOrientationEvent() {},
        });

        expect(runPreflight(env).verdict).toBe("ok");
    });

    it("finds decodeAudioData on the constructor prototype", () => {
        class AudioContext {}

        const env = readPreflightEnv({
            AudioContext,
            navigator: { geolocation: {} },
            DeviceOrientationEvent: function DeviceOrientationEvent() {},
        });

        expect(env.decodeAudioData).toBeUndefined();
        expect(runPreflight(env).verdict).toBe("blocked");
    });

    it("reads the phone question off the user agent", () => {
        expect(readPreflightEnv({ navigator: { userAgent: "iPhone" } }).isPhone).toBe(true);
        expect(readPreflightEnv({ navigator: { userAgent: "Android" } }).isPhone).toBe(true);
        expect(readPreflightEnv({ navigator: { userAgent: "Macintosh" } }).isPhone).toBe(false);
    });

    it("survives a window with none of it", () => {
        const preflight = runPreflight(readPreflightEnv({}));

        expect(preflight.verdict).toBe("blocked");
        expect(preflight.orientationNeedsPermission).toBe(false);
    });

    it("detects the iOS orientation permission gate", () => {
        const DeviceOrientationEvent = function () {} as unknown as {
            requestPermission: () => void;
        };
        DeviceOrientationEvent.requestPermission = () => {};

        const env = readPreflightEnv({ DeviceOrientationEvent });

        expect(runPreflight(env).orientationNeedsPermission).toBe(true);
    });
});
