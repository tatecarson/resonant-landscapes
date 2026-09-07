import { memo, useMemo } from "react";

import { useReduceVisuals } from "../hooks/useReduceVisuals";
import { arrivalProgress } from "../utils/arrival";
import { arrivalField, palette, rgbChannels } from "../theme/palette";

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
 * appeared three metres from the centre in a colour — a compass hue — that
 * nothing else in the app could be matched to. The screen was at its emptiest
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
 * The one seam left is deliberately the wrong way round. This mounts at full
 * strength while the tint it replaces takes 700 ms to fade its opacity out, so
 * for that moment the two identical gradients stack and the threshold reads
 * very slightly brighter. Cross-fading them instead would trade that for a dip
 * of the same size, and a dip is the exact failure this exists to fix.
 */

/** ProximityWarmth's clear centre, in percent of the closest side. */
const HOLE_PERCENT = 38;

/**
 * How far off centre the lean sits, in percent. Far enough to read as a
 * direction, near enough that it never leaves the screen on a phone.
 */
const LEAN_OFFSET_PERCENT = 22;

const MINT = rgbChannels(palette.panel);

function mint(alpha: number) {
    return `rgb(${MINT} / ${alpha.toFixed(3)})`;
}

function lerp(from: number, to: number, t: number) {
    return from + (to - from) * t;
}

/**
 * The field's four numbers at a given progress.
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
            lean: 0,
        };
    }

    return {
        edge: lerp(arrivalField.edge.floor, arrivalField.edge.peak, progress),
        core: lerp(arrivalField.core.floor, arrivalField.core.peak, progress),
        hole: HOLE_PERCENT * (1 - progress),
        lean: arrivalField.lean * progress,
    };
}

/**
 * Where the lean sits, as a background-position pair.
 *
 * The map is rotated so that the walker's heading points up the screen, which
 * is why heading cannot be a lean toward "where you are facing": that is the
 * top of the screen at every bearing and says nothing. So the lean holds a
 * bearing instead — it stays put in the world while the screen turns under it,
 * the same way the recording does when the walker turns their head. Turning is
 * the thing being confirmed, and a bloom that sweeps around the edge as you
 * rotate confirms it without asking anyone to decode a hue.
 *
 * The screen shows bearing `headingRadians` at the top (the view is rotated by
 * its negative), so a fixed bearing of zero sits at `-headingRadians`
 * clockwise from up, and x runs right while y runs down.
 */
export function leanPosition(headingRadians: number) {
    const x = 50 - LEAN_OFFSET_PERCENT * Math.sin(headingRadians);
    const y = 50 - LEAN_OFFSET_PERCENT * Math.cos(headingRadians);
    return { x, y };
}

/**
 * `rgb(… / 0)` rather than `transparent`, and this is not pedantry: CSS
 * `transparent` is transparent *black*, so a gradient running to it takes the
 * long way through grey and puts a dirty band across the middle of the ramp.
 * The same fix is in ProximityWarmth, whose gradient this one has to be
 * indistinguishable from at the handover.
 */
function fieldBackground(
    alphas: ReturnType<typeof arrivalFieldAlphas>,
    headingRadians: number,
    showLean: boolean
) {
    const { x, y } = leanPosition(headingRadians);

    /*
     * Bottom layer: the edge bloom, which is ProximityWarmth's gradient
     * continued. Top layer: the lean. Backgrounds composite, so adding the
     * lean can only add colour — the field cannot dim by gaining one.
     */
    const bloom =
        `radial-gradient(ellipse closest-side at center, ` +
        `${mint(alphas.core)} ${alphas.hole.toFixed(1)}%, ` +
        `${mint(alphas.edge)} 100%)`;

    if (!showLean) {
        return bloom;
    }

    /*
     * Emitted even at zero alpha. A background transition only interpolates
     * between lists of the same shape, so a lean that appeared on the first
     * metre inside would make the field snap once instead of growing.
     */
    const lean =
        `radial-gradient(circle closest-side at ${x.toFixed(1)}% ${y.toFixed(1)}%, ` +
        `${mint(alphas.lean)} 0%, ${mint(0)} 70%)`;

    return `${lean}, ${bloom}`;
}

const ArrivalField = memo(function ArrivalField({
    parkDistance,
    headingRadians,
    rotationActive,
}: ArrivalFieldProps) {
    const reduceVisuals = useReduceVisuals();
    const progress = arrivalProgress(parkDistance);

    const background = useMemo(
        () =>
            fieldBackground(
                arrivalFieldAlphas(progress, reduceVisuals),
                headingRadians,
                rotationActive && !reduceVisuals
            ),
        [progress, reduceVisuals, headingRadians, rotationActive]
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
                 * Matched to ProximityWarmth's, so the handover at fifteen
                 * metres cannot be seen. Not decoration either: a fix carries
                 * several metres of error, and without this the field steps on
                 * every jitter of the walker's position rather than tracking
                 * the walk.
                 *
                 * Reduced visuals gets no transition because it gets no
                 * dissolve — one static state, arrived at instantly.
                 */
                transition: reduceVisuals ? undefined : "background 900ms ease-out",
            }}
        />
    );
});

export default ArrivalField;
