import { memo, useMemo } from "react";

import { useReduceVisuals } from "../hooks/useReduceVisuals";
import { arrivalProgress } from "../utils/arrival";
import { arrivalField, hslChannels, palette } from "../theme/palette";

interface ArrivalFieldProps {
    /** Metres to the centre of the park the walker is inside. */
    parkDistance: number;
    /**
     * The walker's heading in radians, which the map is already rotated by.
     * Only meaningful while rotation is on; ignored otherwise.
     */
    headingRadians: number;
    /** True once head tracking is running, which is what makes heading mean anything. */
    rotationActive: boolean;
}

/**
 * The last fifteen metres, as one gesture.
 *
 * Walking into a spot used to cross three unrelated states. The approach tint
 * switched off at the threshold, the glow under the spot faded out as the
 * walker moved onto it, and nothing replaced either until a full-screen wash
 * appeared three metres from the centre. The screen was at its emptiest
 * somewhere around six metres out, which is the moment it should have been at
 * its fullest, and the intensity curve was inverted exactly at arrival.
 *
 * This is the one surface that spans that band. It picks up at the strength
 * ProximityWarmth hands over at, in the same colour and the same shape, and
 * grows inward until the whole screen is the mint the park strip is made of.
 * Nothing switches; the map dissolves under it (see the tile layer's opacity
 * in GeolocationMap) and the field takes the screen. Navigation ends and
 * listening begins, which is the true thing to say at that point: once the
 * walker is inside the recording the map has nothing left to tell them.
 *
 * WHAT TURNING DOES
 *
 * Once head tracking is on, the field's hue follows the compass, which is the
 * palette pass's decision (rl-wmn) and is kept. rl-879 proposed moving heading
 * off hue altogether, and that turned out to be the wrong trade: a lean —
 * whether a bloom or a whole side of the screen — is a difference of about
 * twenty values on a screen that is already almost all mint, and hue is the
 * only channel with room to say something that size. What the issue was
 * actually objecting to was a jump to full intensity in an unrelated colour
 * three metres from the centre, and that is fixed by the dissolve rather than
 * by the hue.
 *
 * The anchor moved instead. The sweep used to run `220 - heading`, which is
 * blue at north for no reason anyone could name, and that is why nothing in
 * the app could be matched to it. It now runs out from `panel`, so facing
 * north is exactly the mint the walker arrived in and every other bearing is a
 * mint-weight version of its own hue.
 *
 * The one seam left is deliberately the wrong way round. This mounts at full
 * strength while the tint it replaces takes 700 ms to fade its opacity out, so
 * for that moment the two identical gradients stack and the threshold reads
 * very slightly brighter. Cross-fading them instead would trade that for a dip
 * of the same size, and a dip is the exact failure this exists to fix.
 */

/** ProximityWarmth's clear centre, in percent of the closest side. */
const HOLE_PERCENT = 38;

/**
 * The field's colour, minus its hue: `panel` decomposed, so a change to the
 * palette moves this with it rather than leaving a second set of numbers to
 * drift. At heading zero the field is `panel` exactly.
 */
const ANCHOR = hslChannels(palette[arrivalField.sweep.anchor as "panel"]);

function wash(hue: number, alpha: number) {
    return (
        `hsla(${hue.toFixed(1)}, ${ANCHOR.saturation.toFixed(1)}%, ` +
        `${ANCHOR.lightness.toFixed(1)}%, ${alpha.toFixed(3)})`
    );
}

function lerp(from: number, to: number, t: number) {
    return from + (to - from) * t;
}

/**
 * The field's three numbers at a given progress.
 *
 * Split out from the component because monotonicity is the whole requirement
 * and it is the kind of thing that a later tuning pass breaks silently — the
 * defect this fixes was exactly a curve that went the wrong way for six
 * metres. `ArrivalField.test.ts` walks this in from fifteen metres and asserts
 * that no number ever falls.
 */
export function arrivalFieldAlphas(progress: number, reduceVisuals: boolean) {
    if (reduceVisuals) {
        // One state for the whole park rather than a dissolve. It still marks
        // the threshold — the field appears — without moving a full screen of
        // colour under someone who asked for less of that.
        return {
            edge: arrivalField.calm.edge,
            core: arrivalField.calm.core,
            hole: 0,
        };
    }

    return {
        edge: lerp(arrivalField.edge.floor, arrivalField.edge.peak, progress),
        core: lerp(arrivalField.core.floor, arrivalField.core.peak, progress),
        hole: HOLE_PERCENT * (1 - progress),
    };
}

/**
 * The hue for a heading: the whole wheel, so any two directions are told
 * apart, running out from the palette rather than past it.
 *
 * Subtracted rather than added because the map is rotated so the walker's
 * heading points up the screen. The wheel turning the other way is what makes
 * the colour feel attached to the world instead of to the phone.
 */
export function hueFor(headingRadians: number) {
    const degrees = (headingRadians * 180) / Math.PI;
    return (((ANCHOR.hue - degrees) % 360) + 360) % 360;
}

/**
 * `hsla(…, 0)` rather than `transparent`, and this is not pedantry: CSS
 * `transparent` is transparent *black*, so a gradient running to it takes the
 * long way through grey and puts a dirty band across the middle of the ramp.
 * The same fix is in ProximityWarmth, whose gradient this one has to be
 * indistinguishable from at the handover.
 */
function fieldBackground(alphas: ReturnType<typeof arrivalFieldAlphas>, hue: number) {
    return (
        `radial-gradient(ellipse closest-side at center, ` +
        `${wash(hue, alphas.core)} ${alphas.hole.toFixed(1)}%, ` +
        `${wash(hue, alphas.edge)} 100%)`
    );
}

const ArrivalField = memo(function ArrivalField({
    parkDistance,
    headingRadians,
    rotationActive,
}: ArrivalFieldProps) {
    const reduceVisuals = useReduceVisuals();
    const progress = arrivalProgress(parkDistance);
    /*
     * Held at the anchor unless the walker turned rotation on. Before that the
     * heading is a GPS course rather than a compass, so a field that swung
     * with it would be reporting the noise in a walking pace.
     *
     * Reduced visuals holds it too. A full screen of colour moving under a
     * phone at walking pace is what that setting exists to suppress, and a hue
     * sweep is the largest-area motion in the app.
     */
    const hue = rotationActive && !reduceVisuals ? hueFor(headingRadians) : ANCHOR.hue;

    const background = useMemo(
        () => fieldBackground(arrivalFieldAlphas(progress, reduceVisuals), hue),
        [progress, reduceVisuals, hue]
    );

    return (
        <div
            data-testid="arrival-field"
            /* Read by the specs. The alpha is what a walker sees and the wrong
             * thing to assert on, because any tuning of the weights would
             * break a test that is not about the weights. */
            data-arrival={progress.toFixed(2)}
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none"
            style={{
                /*
                 * The same layer the approach tint sits on, because it is the
                 * same gesture. Above the map, below the strip that names the
                 * park, and below the field guide — which is also why this is
                 * not suppressed when the guide opens: a field that vanished
                 * and came back would flash the whole screen for a walker
                 * checking one line of it.
                 */
                zIndex: 30,
                background,
                /*
                 * Short, and shorter than ProximityWarmth's 900 ms, because
                 * this one property carries two things at different speeds.
                 * Distance needs smoothing: a fix has several metres of error
                 * in it, and with no transition the field steps on every
                 * jitter rather than tracking the walk. Heading needs none —
                 * it is a head turning, and lagging that by most of a second
                 * is the difference between the screen answering the walker
                 * and trailing them. This is the shortest span that still
                 * hides the jitter.
                 *
                 * Reduced visuals gets no transition because it gets no
                 * dissolve and no sweep: one static state, arrived at
                 * instantly.
                 */
                transition: reduceVisuals ? undefined : "background 350ms ease-out",
            }}
        />
    );
});

export default ArrivalField;
