/**
 * The palette. One definition, three exits.
 *
 * Every colour in the app comes from here. Tailwind reads this file to build
 * its `theme.extend.colors`, so components say `text-ink` rather than a hex;
 * `src/index.css` mirrors the same values onto `:root` as `--rl-*` custom
 * properties, so plain CSS (`src/components/layers.css`, which styles markup
 * OpenLayers generates and Tailwind cannot reach) can use them; and the canvas
 * layers import this module directly, because a `ctx.strokeStyle` cannot read
 * a Tailwind class or, without a `getComputedStyle` round trip every frame, a
 * custom property either.
 *
 * The mirrored CSS block is checked against this file by
 * `src/theme/palette.test.ts`, so the two cannot drift.
 *
 * WHY THESE VALUES
 *
 * The greens are the identity and were preserved, not redesigned. What this
 * palette fixed was everything that had grown up around them: the app had two
 * complete colour worlds that never met. The walker-facing UI was mint panels
 * with Tailwind's warm-grey `neutral-900` ink; the map chrome, the marker SVGs
 * and the debug panel were cream grounds with a green-black ink. Mixing a warm
 * grey and a green-black was the most visible inconsistency in the app, so the
 * greys lost — but only to a green-black chosen to land within 0.03 of
 * `neutral-900`'s contrast at every alpha the app uses, which is why nothing
 * needed re-tuning to keep its legibility when the ink changed underneath it.
 *
 * CONTRAST
 *
 * This is read on a phone held outdoors in daylight at walking pace, so the
 * targets here are the WCAG minimums (4.5:1 text, 3:1 UI edges) treated as a
 * floor rather than a goal. Ratios quoted below are against the ground each
 * value is actually used on.
 */

/**
 * Roles, not hues. A later palette change is this object.
 */
export const palette = {
    /**
     * Primary text, solid buttons, hairline shadows, and the approach ring.
     *
     * A green-black rather than Tailwind's `neutral-900` (#171717): 9.92:1 on
     * the mint panel and 15.90:1 on cream, against neutral-900's 9.94 and
     * 15.93. Close enough at every alpha in use (/80, /75, /70, /60) that the
     * swap changed no legibility anywhere, which is the only reason the ink
     * could move without re-tuning a hundred call sites.
     */
    ink: "#0b1a16",

    /**
     * Secondary labels on the light grounds — the debug panel's field names,
     * and anything captioning a value rather than being one.
     *
     * Replaces #6a8276, which measured 3.68:1 on cream and failed for text at
     * any size. This clears 7.12:1 on cream, 6.21:1 on the sage surface and
     * 8.02:1 on white.
     *
     * Deliberately not used on the mint panel: no green light enough to read
     * as "muted" clears 4.5:1 against #8ecdc0 (this one reaches 4.45). Muted
     * copy on mint is `ink` at 70% instead, which measures 4.89:1.
     */
    inkMuted: "#35574c",

    /** White, for text and marks sitting on `ink` or `edge`. */
    onInk: "#ffffff",

    /** Cream. The page ground and the ground of the map chrome. */
    ground: "#f6f1e7",

    /**
     * Mint. Every walker-facing panel: the modals, the park strip, the
     * location-status card, the offline and install notices.
     */
    panel: "#8ecdc0",

    /** Sage. Blocks raised off `ground` — the debug panel's inner cards. */
    surface: "#dbe5de",

    /**
     * Borders, hairlines, map strokes, and the hover state of `ink` buttons.
     *
     * Collapses #23463a and #21493E, which were the same colour typed twice by
     * two different hands, plus the `rgba(35, 70, 58, …)` and
     * `rgba(33, 73, 62, …)` spellings of it. 5.58:1 on mint, 8.94:1 on cream.
     */
    edge: "#21493e",

    /**
     * The mid green: the sun rays, the "audio ready" dot, active marks.
     * Replaces `rgb(29, 158, 117)`, a teal the canvas code had invented.
     */
    accent: "#2f6b52",

    /**
     * The light green: park marker fill and the park glow beneath it.
     * Replaces `rgb(50, 93, 9)`, an olive nothing else in the app used.
     */
    accentSoft: "#3f7a63",

    /**
     * Terracotta, and the only warm colour in the identity. It is the dot at
     * the centre of the walker's own marker — the one mark on the map that is
     * not a park — and it earns being the exception by being the answer to
     * "where am I".
     */
    beacon: "#d98962",

    /**
     * Status: conventional hues, pulled toward the palette's temperature.
     *
     * Error stays recognisably red and warning recognisably amber, because
     * these are read by someone standing outdoors with a failure in front of
     * them and the learned meaning of the colour is doing real work. Both are
     * deepened well past their Tailwind ancestors (rose-700, amber-800) so
     * they clear 4.5:1 on the mint panel, which is where most of them appear
     * and where the originals did not: rose-700 and amber-800 both failed
     * there.
     *
     * Success has no colour of its own. The one thing that reported it — the
     * "ready" dot — is green already, so it uses `accent` and the palette
     * carries one fewer hue.
     */
    statusError: "#6b2f22",        // 5.67 on mint, 9.08 on cream, 7.91 on its surface
    statusErrorSurface: "#f7ddd5",
    statusWarning: "#5e4a1a",      // 4.71 on mint, 7.55 on cream, 6.85 on its surface
    statusWarningSurface: "#f3e6c4",

    /**
     * The two ends of the proximity warmth ramp, which interpolates between
     * them by distance to the nearest unheard recording.
     *
     * Named here rather than recoloured. These are the one place in the app
     * where colour is computed from live data instead of chosen, the hue is
     * the signal (see ProximityWarmth), and both values were set by looking at
     * screenshots on an iphone-13 profile rather than picked from a ramp.
     * Folding them into the greens would break the thing they are for: every
     * path between them on the hue wheel runs through green, so a green
     * endpoint has nowhere to travel.
     */
    warmthCold: "#7e949c",
    warmthWarm: "#e2a860",
};

/**
 * The ambient wash inside a park, which is the one surface whose hue is not
 * chosen here at all: it tracks the walker's compass heading across the whole
 * wheel (see AmbientGradient), so the palette cannot name its colour. What the
 * palette does govern is its weight.
 *
 * The sweep used to run at 80% saturation and 0.75 alpha, which put a
 * full-screen primary over the map — blue, then green, then amber, then
 * magenta as the walker turned. It was the loudest thing in the app and the
 * only one that did not look like the rest of it.
 *
 * The mapping is untouched: every heading still gets its own hue and any two
 * of them are still told apart. Only the saturation, lightness and alpha moved,
 * so each hue now arrives at the weight everything else is drawn at. Narrowing
 * the hue range instead was tried and rejected — confined to the greens, half
 * the headings become indistinguishable and the wash stops saying anything
 * about turning.
 *
 * Saturation and alpha move together. At 30% saturation the old 0.75 alpha is
 * a grey veil rather than a tint, which is why both numbers changed.
 *
 * Expect these to want raising after a walk rather than lowering, for the same
 * reason ProximityWarmth's alphas did: judged on a desk monitor indoors, read
 * on a phone outdoors.
 */
export const ambientWash = {
    /** The centre of the wash, at full strength. */
    core: { saturation: 30, lightness: 48, alpha: 0.42 },
    /** 40% out, on the way to transparent at 80%. */
    edge: { saturation: 26, lightness: 44, alpha: 0.22 },
    /**
     * The calm form: the same presence with the hue held still, for the walker
     * who turned visuals down. Quieter again than the moving version, because
     * what reduced visuals is protecting against is a large area of colour
     * changing under a screen held at walking pace.
     */
    calmCore: { saturation: 26, lightness: 46, alpha: 0.16 },
    calmEdge: { saturation: 22, lightness: 42, alpha: 0.10 },
};

/**
 * `"11 26 22"` — the space-separated form `rgb(… / <alpha>)` takes, for the
 * CSS custom properties. Every token gets one; CSS decides which it needs.
 */
export function rgbChannels(hex) {
    const value = hex.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)).join(" ");
}

/**
 * A token at an alpha, for the canvas layers, which build their colours per
 * frame from a computed opacity and cannot use a class or a custom property.
 */
export function withAlpha(hex, alpha) {
    const value = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The `--rl-*` custom property name for a token, e.g. `inkMuted` -> `--rl-ink-muted`. */
export function cssVariableName(token) {
    return `--rl-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export default palette;
