import { describe, expect, it } from "vitest";
import { palette } from "../theme/palette";
import {
    DEFAULTS,
    DEFAULT_PAINTED_TONE,
    PAINTED_TONES,
    decodeTuning,
    encodeTuning,
    isTuningRequested,
    normalizeTuning,
    parsePaintedTone,
} from "./paintTuning";

/** Tokens at least as dark as the park markers' fill. */
const MARKER_DARK_TOKENS = new Set(["edge", "accentSoft", "inkMuted", "ink"]);

describe.each(Object.entries(PAINTED_TONES))("the %s painted ground", (_, tone) => {
    it("is made only of palette tokens", () => {
        for (const { token } of tone.ramp) {
            expect(palette).toHaveProperty(token);
        }
    });

    it("runs from 0 to 1 in order, so every lightness lands on it", () => {
        const stops = tone.ramp.map(({ at }) => at);
        expect(stops[0]).toBe(0);
        expect(stops[stops.length - 1]).toBe(1);
        expect([...stops].sort((a, b) => a - b)).toEqual(stops);
    });

    it("keeps the ground lighter than the tokens the park markers use", () => {
        const darkest = Math.max(
            ...tone.ramp.filter(({ token }) => MARKER_DARK_TOKENS.has(token)).map(({ at }) => at),
        );
        expect(tone.floor).toBeGreaterThan(darkest);
    });

    it("leaves the photograph a minority of the colour", () => {
        expect(tone.original).toBeGreaterThanOrEqual(0);
        expect(tone.original).toBeLessThan(0.5);
    });
});

describe("painted ground", () => {
    it("defaults to a tone that exists", () => {
        expect(PAINTED_TONES).toHaveProperty(DEFAULT_PAINTED_TONE);
    });

    it("brings highlights to the top of the ramp before full white", () => {
        expect(DEFAULTS.ceiling).toBeGreaterThan(0);
        expect(DEFAULTS.ceiling).toBeLessThanOrEqual(1);
    });
});

describe("normalizeTuning", () => {
    it("makes anything into the defaults, whole", () => {
        expect(normalizeTuning(undefined)).toEqual(DEFAULTS);
        expect(normalizeTuning("nonsense")).toEqual(DEFAULTS);
        expect(normalizeTuning({ unknown: 3 })).toEqual(DEFAULTS);
    });

    it("keeps what it is given, held to each slider's range", () => {
        const tuning = normalizeTuning({ grain: 0.08, radius: 99, wobble: -4, streets: { pathOpacity: 0.7 } });
        expect(tuning.grain).toBe(0.08);
        expect(tuning.radius).toBe(6);
        expect(tuning.wobble).toBe(0);
        expect(tuning.streets.pathOpacity).toBe(0.7);
        expect(tuning.streets.streetWidth).toBe(DEFAULTS.streets.streetWidth);
    });

    it("rounds the radius, which the shader counts in whole steps", () => {
        expect(normalizeTuning({ radius: 3.6 }).radius).toBe(4);
    });

    it("keeps a tone's stops in order so the ramp cannot fold back", () => {
        const stops = normalizeTuning({ tones: { mint: { stops: [0.7, 0.4, 0.9] } } }).tones.mint.stops;
        expect(stops).toEqual([0.7, 0.7, 0.9]);
    });

    it("ignores a tone it does not know", () => {
        expect(normalizeTuning({ tone: "magenta" }).tone).toBe(DEFAULT_PAINTED_TONE);
    });
});

describe("sharing a tuning by link", () => {
    it("survives the round trip", () => {
        const tuning = normalizeTuning({ tone: "paper", grain: 0.07, tones: { paper: { floor: 0.33 } } });
        expect(decodeTuning(encodeTuning(tuning))).toEqual(tuning);
    });

    it("is URL-safe", () => {
        expect(encodeTuning(DEFAULTS)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("reads a damaged link as nothing rather than throwing", () => {
        expect(decodeTuning("%%%")).toBeNull();
    });
});

describe("URL switches", () => {
    it("opens the panel on ?tune, with or without a value, in either place", () => {
        expect(isTuningRequested("?tune", "")).toBe(true);
        expect(isTuningRequested("", "#/washpav?tune")).toBe(true);
        expect(isTuningRequested("?basemap=painted", "")).toBe(false);
    });

    it("takes a tone from ?tone= first, then from ?basemap=", () => {
        expect(parsePaintedTone("?basemap=sage&tone=paper", "")).toBe("paper");
        expect(parsePaintedTone("?basemap=sage", "")).toBe("sage");
    });
});
