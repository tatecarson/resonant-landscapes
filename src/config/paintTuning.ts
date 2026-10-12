import { useSyncExternalStore } from "react";
import type { palette } from "../theme/palette";

/**
 * Everything that sets how the painted ground looks (rl-ffdd), in one place
 * so the shader, the street lines and the tuning panel read the same values.
 *
 * The defaults are what ships. A walker's own tuning, made in the panel that
 * `?tune` opens, overrides them on that device once saved, and a `?paint=`
 * link carries a tuning to another device without saving it. To make a tuning
 * the default for everyone, its "Copy settings" JSON goes into DEFAULTS below.
 */

type Token = keyof typeof palette;
export type ToneStop = { token: Token; at: number };

export interface PaintedTone {
    /**
     * The lightness ramp, dark to light, as palette tokens: no colour here is
     * chosen, only which tokens and where on the ramp they sit.
     */
    ramp: readonly ToneStop[];
    /**
     * Where the darkest patch lands on the ramp. Above zero so nothing on the
     * ground reaches the dark greens the park markers are drawn in.
     */
    floor: number;
    /** How much of the photograph's own colour survives the remap. */
    original: number;
}

/**
 * Grounds to compare under the panels, chosen with `?tone=` or `?basemap=`.
 *
 * `mint` runs through `panel`, so most of the ground is the same mint as the
 * park strip, the modals and the arrival field, and walking in changes the
 * detail on screen but not its colour. `sage` leaves `panel` out, but
 * `surface` is still a pale green and came out close to mint. `paper` is
 * mostly cream: grey-green canopy, then sage into a long run of `ground`, with
 * none of the photograph's own colour, so arriving reads as the screen turning
 * from cream to mint.
 */
export const PAINTED_TONES = {
    mint: {
        ramp: [
            { token: "edge", at: 0 },
            { token: "accentSoft", at: 0.3 },
            { token: "panel", at: 0.6 },
            { token: "surface", at: 0.82 },
            { token: "ground", at: 1 },
        ],
        floor: 0.5,
        original: 0.15,
    },
    sage: {
        ramp: [
            { token: "edge", at: 0 },
            { token: "inkMuted", at: 0.3 },
            { token: "surface", at: 0.75 },
            { token: "ground", at: 1 },
        ],
        floor: 0.55,
        original: 0.15,
    },
    paper: {
        ramp: [
            { token: "edge", at: 0 },
            { token: "inkMuted", at: 0.3 },
            { token: "surface", at: 0.6 },
            { token: "ground", at: 0.8 },
            { token: "ground", at: 1 },
        ],
        floor: 0.4,
        original: 0,
    },
} as const satisfies Record<string, PaintedTone>;

export type PaintedToneName = keyof typeof PAINTED_TONES;
export const PAINTED_TONE_NAMES = Object.keys(PAINTED_TONES) as PaintedToneName[];

/**
 * Mint, chosen by eye on the Pavilion plaza. Sage measured no better against
 * the panels where they actually appear, because inside a park the arrival
 * field washes the screen in panel either way.
 */
export const DEFAULT_PAINTED_TONE: PaintedToneName = "mint";

export function isPaintedToneName(value: unknown): value is PaintedToneName {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(PAINTED_TONES, value);
}

/** The largest brush radius the shader's loops are built for. */
export const MAX_RADIUS = 6;

/** The part of a tone the panel can move: everything but which tokens. */
export interface ToneTuning {
    floor: number;
    original: number;
    /** The ramp's inner stops, in order; the ends are always 0 and 1. */
    stops: number[];
}

export interface PaintTuning {
    tone: PaintedToneName;
    /** Sampling radius in brush steps. */
    radius: number;
    /** CSS pixels between samples; with the radius, the brush size. */
    brushStep: number;
    /** Output pixels per CSS pixel. */
    resolution: number;
    /** How sharply the flattest quarter disc wins; high snaps, low blurs. */
    sharpness: number;
    /** Source lightness that reaches the top of the ramp. */
    ceiling: number;
    /** How far the sampling wanders, in brush steps: the hand-drawn edge. */
    wobble: number;
    /** How tight that wander is, in cycles per map unit. */
    wobbleScale: number;
    /** Paper grain, as a fraction of brightness. */
    grain: number;
    tones: Record<PaintedToneName, ToneTuning>;
    streets: {
        /** Drawn width of a street on the ground, in metres. */
        streetWidth: number;
        streetOpacity: number;
        /** Drawn width of a sidewalk or footpath on the ground, in metres. */
        pathWidth: number;
        pathOpacity: number;
    };
}

/** A deep copy; structuredClone is missing from iOS 15.0 to 15.3, which the walk supports. */
function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function toneDefaults(tone: PaintedTone): ToneTuning {
    return { floor: tone.floor, original: tone.original, stops: tone.ramp.slice(1, -1).map(({ at }) => at) };
}

export const DEFAULTS: PaintTuning = {
    tone: DEFAULT_PAINTED_TONE,
    radius: 4,
    brushStep: 2,
    resolution: 0.75,
    sharpness: 4,
    ceiling: 0.8,
    wobble: 2.5,
    wobbleScale: 0.3,
    grain: 0.04,
    tones: {
        mint: toneDefaults(PAINTED_TONES.mint),
        sage: toneDefaults(PAINTED_TONES.sage),
        paper: toneDefaults(PAINTED_TONES.paper),
    },
    streets: { streetWidth: 7, streetOpacity: 0.92, pathWidth: 0.8, pathOpacity: 0.42 },
};

type NumberKey = { [K in keyof PaintTuning]: PaintTuning[K] extends number ? K : never }[keyof PaintTuning];
type StreetKey = keyof PaintTuning["streets"];

export interface Slider<K extends string> {
    key: K;
    label: string;
    min: number;
    max: number;
    step: number;
}

/** The panel's controls and the bounds every tuning is held to, however it arrives. */
export const BRUSH_SLIDERS: Slider<NumberKey>[] = [
    { key: "radius", label: "Brush radius (steps)", min: 1, max: MAX_RADIUS, step: 1 },
    { key: "brushStep", label: "Brush step (px)", min: 1, max: 4, step: 0.25 },
    { key: "resolution", label: "Resolution (px per px)", min: 0.25, max: 1.5, step: 0.05 },
    { key: "sharpness", label: "Edge sharpness", min: 0.5, max: 12, step: 0.5 },
    { key: "wobble", label: "Wobble", min: 0, max: 6, step: 0.25 },
    { key: "wobbleScale", label: "Wobble tightness", min: 0.05, max: 1.5, step: 0.05 },
    { key: "grain", label: "Grain", min: 0, max: 0.15, step: 0.005 },
    { key: "ceiling", label: "Highlight ceiling", min: 0.3, max: 1, step: 0.01 },
];
export const TONE_SLIDERS: Slider<"floor" | "original">[] = [
    { key: "floor", label: "Darkest tone", min: 0, max: 0.9, step: 0.01 },
    { key: "original", label: "Photo colour", min: 0, max: 0.6, step: 0.01 },
];
export const STREET_SLIDERS: Slider<StreetKey>[] = [
    { key: "streetWidth", label: "Street width (m)", min: 0, max: 16, step: 0.5 },
    { key: "streetOpacity", label: "Street opacity", min: 0, max: 1, step: 0.02 },
    { key: "pathWidth", label: "Sidewalk width (m)", min: 0, max: 3, step: 0.1 },
    { key: "pathOpacity", label: "Sidewalk opacity", min: 0, max: 1, step: 0.02 },
];

function clampTo(slider: { min: number; max: number }, value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(slider.max, Math.max(slider.min, value)) : fallback;
}

/**
 * Any partial or stale tuning made whole and in range: unknown keys dropped,
 * missing ones defaulted, numbers clamped to their slider. Saved tunings and
 * shared links outlive the code that wrote them, so nothing read back is
 * trusted.
 */
export function normalizeTuning(input: unknown): PaintTuning {
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const tuning: PaintTuning = clone(DEFAULTS);
    if (isPaintedToneName(raw.tone)) tuning.tone = raw.tone;
    for (const slider of BRUSH_SLIDERS) {
        tuning[slider.key] = clampTo(slider, raw[slider.key], DEFAULTS[slider.key]);
    }
    tuning.radius = Math.round(tuning.radius);
    const rawStreets = (raw.streets && typeof raw.streets === "object" ? raw.streets : {}) as Record<string, unknown>;
    for (const slider of STREET_SLIDERS) {
        tuning.streets[slider.key] = clampTo(slider, rawStreets[slider.key], DEFAULTS.streets[slider.key]);
    }
    const rawTones = (raw.tones && typeof raw.tones === "object" ? raw.tones : {}) as Record<string, unknown>;
    for (const name of PAINTED_TONE_NAMES) {
        const rawTone = (rawTones[name] && typeof rawTones[name] === "object" ? rawTones[name] : {}) as Record<string, unknown>;
        const target = tuning.tones[name];
        for (const slider of TONE_SLIDERS) {
            target[slider.key] = clampTo(slider, rawTone[slider.key], DEFAULTS.tones[name][slider.key]);
        }
        const stops = Array.isArray(rawTone.stops) ? rawTone.stops : [];
        let previous = 0;
        target.stops = DEFAULTS.tones[name].stops.map((fallback, index) => {
            // In order and inside (0, 1), or the ramp folds back on itself.
            const value = clampTo({ min: previous, max: 1 }, stops[index], Math.max(previous, fallback));
            previous = value;
            return value;
        });
    }
    return tuning;
}

/** A query parameter from the search or from the query inside the hash, as `?mock=` is read. */
export function queryParam(search: string, hash: string, name: string): string | null {
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(search).get(name) ?? new URLSearchParams(hashQuery).get(name);
}

/** The painted ground's ramp: `?tone=`, else a tone named as `?basemap=`. */
export function parsePaintedTone(search: string, hash: string): PaintedToneName | null {
    const tone = queryParam(search, hash, "tone");
    if (isPaintedToneName(tone)) return tone;
    const basemap = queryParam(search, hash, "basemap");
    return isPaintedToneName(basemap) ? basemap : null;
}

/** `?tune` opens the panel. Its own switch, not `?debug`: it only changes how the ground looks. */
export function isTuningRequested(search: string, hash: string): boolean {
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(search).has("tune") || new URLSearchParams(hashQuery).has("tune");
}

/** A tuning as URL-safe base64 of its JSON, for `?paint=`. */
export function encodeTuning(tuning: PaintTuning): string {
    const bytes = new TextEncoder().encode(JSON.stringify(tuning));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeTuning(encoded: string): PaintTuning | null {
    try {
        const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return normalizeTuning(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
        return null;
    }
}

const STORAGE_KEY = "paintTuning";

function readSaved(): PaintTuning | null {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? normalizeTuning(JSON.parse(raw)) : null;
    } catch {
        // Private mode and blocked storage both throw; the defaults stand.
        return null;
    }
}

/**
 * Where a page load starts: a shared `?paint=` link, else this device's saved
 * tuning, else the defaults. A tone named in the URL wins over any of them,
 * so `?basemap=paper` still shows paper.
 */
function initialTuning(): PaintTuning {
    if (typeof window === "undefined") return clone(DEFAULTS);
    const { search, hash } = window.location;
    const shared = queryParam(search, hash, "paint");
    const tuning = (shared ? decodeTuning(shared) : null) ?? readSaved() ?? clone(DEFAULTS);
    const tone = parsePaintedTone(search, hash);
    return tone ? { ...tuning, tone } : tuning;
}

let current: PaintTuning = initialTuning();
let saved: PaintTuning | null = typeof window === "undefined" ? null : readSaved();
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

export function subscribePaintTuning(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getPaintTuning(): PaintTuning {
    return current;
}

export function setPaintTuning(next: PaintTuning) {
    current = normalizeTuning(next);
    emit();
}

/** Keeps the current tuning on this device; it applies on every later load. */
export function savePaintTuning(): boolean {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        saved = current;
        emit();
        return true;
    } catch {
        return false;
    }
}

/** Back to the shipped defaults, and forgets this device's saved tuning. */
export function resetPaintTuning() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing saved to forget.
    }
    saved = null;
    current = clone(DEFAULTS);
    emit();
}

export function isPaintTuningSaved(): boolean {
    return saved !== null && JSON.stringify(saved) === JSON.stringify(current);
}

export function usePaintTuning(): PaintTuning {
    return useSyncExternalStore(subscribePaintTuning, getPaintTuning, () => DEFAULTS);
}
