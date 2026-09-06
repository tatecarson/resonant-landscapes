import { memo, useMemo } from "react";

import { distanceInMeters, type Coordinate } from "../utils/geo";
import { useReduceVisuals } from "../hooks/useReduceVisuals";
import { ENTER_DISTANCE_METERS } from "../config/geofence";
import { palette, rgbChannels } from "../theme/palette";

interface ProximityWarmthProps {
    /** The walker, in lon/lat. Null until the first fix arrives. */
    userLonLat: Coordinate | null;
    parks: { name: string; scaledCoords: Coordinate }[];
    heardParks: ReadonlySet<string>;
    /**
     * False while a park strip is on screen. Standing in a park has its own
     * ambient wash, and two full-screen tints arguing with each other is
     * neither of them.
     */
    active: boolean;
}

/**
 * Hot and cold, for the walker who cannot see anywhere to go.
 *
 * This replaces the nearest-park chip (rl-2l3), which named the nearest park,
 * its distance and its compass point, permanently. That was a readout to
 * follow rather than a campus to wander, on a piece whose whole subject is
 * finding things. What the chip was answering is still real, though, and the
 * note it left behind is the reason this exists: outside prefetch range the
 * map is a dot on empty ground, and that is the state a walk spends most of
 * its time in and the state in which someone gives up and goes home.
 *
 * So: no name, no metres, no bearing. The ground runs cold and warms as the
 * walker closes on a recording. Finding is wandering, which is the game a
 * child plays and the one the piece was always describing.
 *
 * Deliberately not directional. An edge bloom aimed by the compass would need
 * the gimbal's heading out here between parks, and rotation tracking only runs
 * at a park's centre — so pointing would move an iOS permission prompt to the
 * start of the walk, against a welcome screen that promises rotation comes
 * later. Distance alone needs nothing the walk does not already have.
 */

/**
 * Warmest at the moment of arrival and cold well before the far side of the
 * campus.
 *
 * The numbers come from the placement rather than taste. On the DSU mapping
 * the thirteen spots sit a median 20 m apart (min 16, max 63) inside a field
 * about 293 m across, and a park opens at ENTER_DISTANCE_METERS. So the band
 * worth resolving is the one from arrival out to roughly the width of the
 * cluster: inside it the walker is choosing between neighbours, beyond it they
 * are crossing the campus and the only useful word is "further".
 */
const COLD_AT_METERS = 120;

/**
 * The ramp is curved, and it has to be.
 *
 * Straight-line distance was the obvious mapping and it is nearly useless on
 * this campus. From a point 25 m off Hartford Beach the next unheard spot is
 * 43 m away, and a linear ramp calls those 0.91 and 0.73 — three hundredths of
 * alpha apart, which is nothing a walker would see. The tint would sit pinned
 * warm through the entire early walk, which is the exact failure targeting
 * unheard spots was supposed to avoid.
 *
 * Squaring spends the range where the walking happens: the same two points
 * become 0.83 and 0.54, which is a difference you can watch change. It also
 * matches how nearness is felt rather than measured — the last twenty metres
 * are worth far more than the twenty before them.
 */
const FALLOFF = 2;

/**
 * Cool slate to amber, interpolated in RGB rather than through a hue wheel:
 * every path between these two hues on the wheel runs through either green or
 * magenta, and a map that goes briefly green on the way to warm reads as a
 * fault rather than a signal.
 *
 * Hue carries this, not brightness. A dim-to-bright ramp is the first thing to
 * disappear on a phone held outdoors in sun, which is the only place this
 * runs.
 */
const COLD_RGB = channels(palette.warmthCold);
const WARM_RGB = channels(palette.warmthWarm);
const COLD_ALPHA = 0.1;
/**
 * Set by looking, not by taste. The first value here was 0.34 and it could not
 * be seen at all against this basemap — the map is a warm cream to begin with,
 * so an amber wash has very little to push against, and a strength that reads
 * as obvious in a swatch disappears once it is over the map it has to sit on.
 * Screenshots at 0.30 and 0.60 on the iphone-13 profile put the usable floor
 * somewhere between; 0.5 is Tate's call from those.
 *
 * Expect this to want raising rather than lowering after a walk. Everything
 * here was judged on a desk monitor indoors, and the piece is read on a phone
 * held outdoors in daylight, where every one of these values is harder to see.
 */
const WARM_ALPHA = 0.5;
/**
 * Same signal, less of it, for the walker who turned visuals down — but not so
 * much less that it stops being a signal. What reduced visuals is protecting
 * against here is intensity, and this tint does not move; a value low enough
 * to be tasteful would repeat the mistake above and leave those walkers with
 * nothing at all to find a recording by, which is worse than a strong tint.
 */
const REDUCED_WARM_ALPHA = 0.35;

/**
 * The palette's channel string as the three numbers this file interpolates
 * between. The ramp is computed per fix, so it needs the components, not a
 * colour it can hand to CSS whole.
 */
function channels(hex: string): [number, number, number] {
    const [r, g, b] = rgbChannels(hex).split(" ").map(Number);
    return [r, g, b];
}

function clamp01(value: number) {
    return Math.min(1, Math.max(0, value));
}

/**
 * How near the walker is to a recording they have not heard yet, 0 cold to 1
 * warm.
 *
 * Nearest UNHEARD, not nearest. With spots a median 20 m apart, a tint keyed
 * to the nearest recording of any kind would sit warm everywhere inside the
 * cluster and say nothing — and it would glow hardest while the walker stood
 * in one they had already heard, which is precisely backwards. Keyed to what
 * is left, the same walk cools as it is used up: warm and crowded at the
 * start, and a long cold hunt by the end, without anything scripting that.
 */
export function warmthFor(
    userLonLat: Coordinate | null,
    parks: { name: string; scaledCoords: Coordinate }[],
    heardParks: ReadonlySet<string>
): number {
    if (!userLonLat) {
        return 0;
    }

    const unheard = parks.filter((park) => !heardParks.has(park.name));
    if (unheard.length === 0) {
        // Every recording heard. There is nothing left to be near, and a warm
        // screen would be pointing at nothing.
        return 0;
    }

    const nearest = Math.min(
        ...unheard.map((park) => distanceInMeters(userLonLat, park.scaledCoords))
    );

    const linear = clamp01(
        (COLD_AT_METERS - nearest) / (COLD_AT_METERS - ENTER_DISTANCE_METERS)
    );

    return linear ** FALLOFF;
}

function mix(from: number, to: number, t: number) {
    return Math.round(from + (to - from) * t);
}

const ProximityWarmth = memo(function ProximityWarmth({
    userLonLat,
    parks,
    heardParks,
    active,
}: ProximityWarmthProps) {
    const reduceVisuals = useReduceVisuals();
    const warmth = useMemo(
        () => warmthFor(userLonLat, parks, heardParks),
        [userLonLat, parks, heardParks]
    );

    const ceiling = reduceVisuals ? REDUCED_WARM_ALPHA : WARM_ALPHA;
    const alpha = COLD_ALPHA + (ceiling - COLD_ALPHA) * warmth;
    const rgb = [
        mix(COLD_RGB[0], WARM_RGB[0], warmth),
        mix(COLD_RGB[1], WARM_RGB[1], warmth),
        mix(COLD_RGB[2], WARM_RGB[2], warmth),
    ];

    return (
        <div
            data-testid="proximity-warmth"
            /* Read by the specs: the colour is the thing a walker sees and the
             * wrong thing to assert on, because any tuning of the ramp would
             * break a test that is not about the ramp. */
            data-warmth={warmth.toFixed(2)}
            aria-hidden="true"
            className={`fixed inset-0 pointer-events-none ${
                active ? "opacity-100" : "opacity-0"
            }`}
            style={{
                zIndex: 30,
                /* An edge bloom rather than a full wash: the map is the thing
                 * being read, and a tint over the middle of it makes the walk
                 * harder to follow in exactly the state this is meant to help. */
                /*
                 * closest-side, and this is not a detail. A radial gradient
                 * sizes itself to the farthest corner by default, and on a
                 * 390x844 phone the corner is about 465 px from the centre
                 * while the side edge is 195 px — 42% of the radius, which is
                 * exactly where the colour used to start. It rendered
                 * perfectly and could not be seen: the sides stayed completely
                 * clear and only the four corners carried anything. Sizing to
                 * the closest side puts full colour at the middle of every
                 * edge, which is what an edge bloom means.
                 */
                background: `radial-gradient(ellipse closest-side at center, transparent 38%, rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)}) 100%)`,
                /* Always transitioned, reduced visuals included. This is not
                 * decoration: a fix carries several metres of error, and
                 * without it the tint steps on every jitter of the walker's
                 * position rather than tracking the walk. */
                transition: "background 900ms ease-out, opacity 700ms ease-out",
            }}
        />
    );
});

export default ProximityWarmth;
