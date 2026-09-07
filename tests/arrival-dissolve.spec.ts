/**
 * The last fifteen metres, walked.
 *
 * rl-879 replaced three visual states with one field, and the thing it fixed
 * cannot be seen in a single frame: the old arrival looked fine at fifteen
 * metres and fine at the centre, and was a hole in between. So this spec walks
 * in and watches the whole approach, which is the only way that class of
 * defect shows up.
 *
 * Two claims are asserted. First, the screen never empties: the strength read
 * off whichever layer owns it — the approach tint outside, the field inside —
 * only ever rises, across the handover included. Second, the two channels stay
 * separate at the centre: turning sweeps the field's hue and leaves its weight
 * alone, because the walker turning on the spot has not moved.
 *
 * To watch it rather than read it:
 *   npm run sim:arrival:iphone     (headed, held at each step)
 *   npm run demo:arrival           (recorded to a video)
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { distanceInMeters, scaleCoordinates, type Coordinate } from "../src/utils/geo.js";
import { palette, rgbChannels } from "../src/theme/palette.js";
import { dismissWelcomeModal, seedOrientationPermission } from "./helpers/app-flow";
import {
    dispatchDeviceOrientation,
    seedDeviceOrientationHarness,
} from "./helpers/device-orientation";

/*
 * The mirrors this reads — __mapDebug for the map's rotation, __basemapOpacity
 * for the dissolve — are gated behind ?debug in a production build, and a spec
 * that drops the query passes locally and fails against a deploy preview for
 * reasons that look nothing like the query (rl-our).
 */
const mapPath = "/?debug";

/** The DSU variant's remap, which is where the walk actually happens. */
const DSU_REFERENCE_POINT: Coordinate = [-97.110789, 44.012222];
const DSU_SCALE_LONG = 0.00045;
const DSU_SCALE_LAT = 0.00066;

/**
 * Extra dwell so a headed or recorded run is watchable. Zero by default,
 * because CI gains nothing from waiting; the sim and demo scripts set it. Same
 * idea as APPROACH_RING_HOLD_MS in approach-ring.spec.ts.
 */
const HOLD_MS = Number(process.env.ARRIVAL_HOLD_MS ?? 0);
const hold = (page: Page) => (HOLD_MS ? page.waitForTimeout(HOLD_MS) : Promise.resolve());

const METRES_PER_DEGREE_LAT = 111_320;

/** Where the walk stops to look, in metres from the spot. */
const STATIONS = [40, 30, 22, 17, 14, 11, 8, 5, 3, 1, 0];

type Station = { metres: number; latitude: number; longitude: number };

function scaledParks() {
    return stateParks.map((park) => ({
        name: park.name,
        coords: scaleCoordinates(
            park.cords as Coordinate,
            DSU_REFERENCE_POINT,
            DSU_SCALE_LONG,
            DSU_SCALE_LAT
        ),
    }));
}

/**
 * A park to walk into, and a bearing to walk in on.
 *
 * Chosen rather than hardcoded because the spots sit a median 20 m apart on
 * this campus, so most straight lines into one of them pass through another —
 * and a walk that opens the wrong park halfway would fail this spec for a
 * reason that has nothing to do with the field. The pick is whichever
 * park-and-bearing keeps every other spot furthest away for the whole
 * approach, which also means it survives the mapping being retuned.
 */
function pickApproach() {
    const parks = scaledParks();
    let best: { park: (typeof parks)[number]; bearing: number; clearance: number } | null = null;

    for (const park of parks) {
        const others = parks.filter((other) => other.name !== park.name);

        for (let bearing = 0; bearing < 360; bearing += 15) {
            const clearance = Math.min(
                ...STATIONS.map((metres) => {
                    const point = stationAt(park.coords, bearing, metres);
                    return Math.min(
                        ...others.map((other) =>
                            distanceInMeters([point.longitude, point.latitude], other.coords)
                        )
                    );
                })
            );

            if (!best || clearance > best.clearance) {
                best = { park, bearing, clearance };
            }
        }
    }

    if (!best) {
        throw new Error("no parks to walk into");
    }

    return best;
}

function stationAt(coords: Coordinate, bearingDegrees: number, metres: number): Station {
    const [longitude, latitude] = coords;
    const radians = (bearingDegrees * Math.PI) / 180;
    const north = (metres * Math.cos(radians)) / METRES_PER_DEGREE_LAT;
    const east =
        (metres * Math.sin(radians)) /
        (METRES_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180));

    return { metres, latitude: latitude + north, longitude: longitude + east };
}

/**
 * The strength of whatever is tinting the screen, from the last stop of its
 * gradient — the screen edge, which is the part a walker sees most of.
 *
 * Deliberately indifferent to which layer is drawing. Outside a park that is
 * ProximityWarmth and inside it is ArrivalField, and the whole design claim is
 * that a walker cannot tell where one stops: same colour, same geometry, same
 * alpha at the metre they trade. Reading them through one function is what
 * lets the handover be asserted rather than described.
 */
async function screenStrength(page: Page) {
    return page.evaluate(() => {
        const field = document.querySelector<HTMLElement>('[data-testid="arrival-field"]');
        const warmth = document.querySelector<HTMLElement>('[data-testid="proximity-warmth"]');
        const layer = field ?? warmth;
        if (!layer) {
            return null;
        }

        const image = getComputedStyle(layer).backgroundImage;
        const stops = [...image.matchAll(/rgba?\(([^)]*)\)/g)].map((match) => match[1]);
        if (!stops.length) {
            return null;
        }

        const last = stops[stops.length - 1].split(",").map((part) => Number(part.trim()));
        return {
            layer: field ? "field" : "warmth",
            alpha: last.length > 3 ? last[3] : 1,
            rgb: last.slice(0, 3).join(" "),
        };
    });
}

/** `panel`, which is the field's colour with the walker facing north. */
const ANCHOR_RGB = rgbChannels(palette.panel).split(" ").map(Number) as [number, number, number];

/** The field's colour, ignoring how much of it there is. */
async function fieldColour(page: Page) {
    return page.evaluate(() => {
        const field = document.querySelector<HTMLElement>('[data-testid="arrival-field"]');
        if (!field) {
            return null;
        }

        const stop = getComputedStyle(field).backgroundImage.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return stop
            ? ([Number(stop[1]), Number(stop[2]), Number(stop[3])] as [number, number, number])
            : null;
    });
}

/** How far apart two colours are, as the sum of their channels' distances. */
function distanceFrom(a: [number, number, number], b: [number, number, number]) {
    return a.reduce((total, channel, index) => total + Math.abs(channel - b[index]), 0);
}

async function settleAt(page: Page, context: BrowserContext, station: Station) {
    // One setGeolocation is never enough: the app interpolates over a history
    // of fixes, so a single one is a jump it smooths away rather than a
    // position it adopts.
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await context.setGeolocation({
            latitude: station.latitude,
            longitude: station.longitude,
        });
        await page.waitForTimeout(350);
    }
    await page.waitForTimeout(900);
}

test("walking in never empties the screen", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("Missing Playwright baseURL.");

    const { park, bearing } = pickApproach();
    const stations = STATIONS.map((metres) => stationAt(park.coords, bearing, metres));

    await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
    await context.setGeolocation({
        latitude: stations[0].latitude,
        longitude: stations[0].longitude,
    });
    await page.goto(mapPath);
    await dismissWelcomeModal(page);

    const readings: { metres: number; layer: string; alpha: number; basemap: number }[] = [];

    for (const station of stations) {
        await settleAt(page, context, station);
        await hold(page);

        const strength = await screenStrength(page);
        expect(strength, `nothing was tinting the screen at ${station.metres} m`).not.toBeNull();

        const basemap = await page.evaluate(() => window.__basemapOpacity ?? 1);
        readings.push({
            metres: station.metres,
            layer: strength!.layer,
            alpha: strength!.alpha,
            basemap,
        });
        console.log(
            `[walk] ${String(station.metres).padStart(2)} m  ${strength!.layer.padEnd(6)}  alpha ${strength!.alpha.toFixed(3)}  basemap ${basemap.toFixed(2)}`
        );
    }

    // The defect this replaced: the screen was emptiest around six metres out,
    // which is the moment it should have been fullest.
    for (let i = 1; i < readings.length; i += 1) {
        const previous = readings[i - 1];
        const current = readings[i];
        expect(
            current.alpha,
            `the screen emptied walking from ${previous.metres} m to ${current.metres} m ` +
                `(${previous.layer} ${previous.alpha} → ${current.layer} ${current.alpha})`
        ).toBeGreaterThanOrEqual(previous.alpha - 0.001);
    }

    // And both layers had a turn, so the run above actually crossed the seam
    // rather than spending the whole walk on one of them.
    expect(new Set(readings.map((reading) => reading.layer))).toEqual(new Set(["warmth", "field"]));

    /*
     * The map goes as the field comes, and it goes entirely. Same band,
     * opposite directions, which is what makes the two read as one motion
     * rather than a tint laid over a map that carries on regardless.
     */
    for (let i = 1; i < readings.length; i += 1) {
        expect(
            readings[i].basemap,
            `the map came back walking from ${readings[i - 1].metres} m to ${readings[i].metres} m`
        ).toBeLessThanOrEqual(readings[i - 1].basemap);
    }
    expect(readings[0].basemap).toBe(1);
    expect(readings[readings.length - 1].basemap).toBe(0);
});

test("turning sweeps the field's colour without changing its weight", async ({
    page,
    context,
    baseURL,
}) => {
    if (!baseURL) throw new Error("Missing Playwright baseURL.");

    const { park, bearing } = pickApproach();
    const centre = stationAt(park.coords, bearing, 0);

    await context.grantPermissions(["geolocation"], { origin: new URL(baseURL).origin });
    await context.setGeolocation({ latitude: centre.latitude, longitude: centre.longitude });
    await seedOrientationPermission(page);
    await seedDeviceOrientationHarness(page);

    await page.goto(mapPath);
    await dismissWelcomeModal(page);

    /*
     * Before anything else, because a real gyroscope reports whether or not
     * the device is moving and the app treats silence as a revoked grant
     * within 1.5 s of rotation enabling (rl-dqc.5). Start this after the walk
     * settles and rotation has already enabled, heard nothing and put itself
     * into the blocked state — which is exactly what happened on webkit while
     * this spec was being written.
     *
     * Held at a quarter turn rather than at zero, because zero is north and
     * north is the anchor: the field's colour there is the same mint it shows
     * with rotation off, so it could not be used to tell whether rotation is
     * running yet.
     */
    await page.evaluate(() => {
        const win = window as Window & {
            __dispatchDeviceOrientation: (a: number, b: number, g: number) => void;
            __arrivalHeartbeatId?: number;
            __arrivalAlpha?: number;
        };
        win.__arrivalAlpha = 90;
        win.__dispatchDeviceOrientation(90, -90, 0);
        win.__arrivalHeartbeatId = window.setInterval(() => {
            win.__dispatchDeviceOrientation(win.__arrivalAlpha ?? 90, -90, 0);
        }, 200);
    });

    // Standing on the spot is still a walk as far as the app is concerned: it
    // smooths a history of fixes, so one is a jump it discards rather than a
    // position it adopts. Webkit is slower to come round than chromium and
    // fails outright without this.
    await settleAt(page, context, centre);
    await expect(page.getByTestId("arrival-field")).toBeAttached({ timeout: 30_000 });

    // Rotation is offered only once the recording is playing, because turning
    // your head is meaningless before there is anything to turn it in.
    await expect
        .poll(() => page.evaluate(() => window.__audioDebug?.isPlaying ?? false), {
            timeout: 30_000,
        })
        .toBe(true);

    /*
     * Two ways in, and the spec does not care which: rotation enables itself
     * where the grant is already stored, and where it does not the walker taps
     * for it. Which one happens depends on the engine and on how quickly the
     * strip settles, so this offers the tap on every poll and stops as soon as
     * the field has swept off its anchor — which is the one on-screen witness
     * that the rotation state reached this layer.
     */
    await expect
        .poll(
            async () => {
                const colour = await fieldColour(page);
                if (colour && distanceFrom(colour, ANCHOR_RGB) > 8) {
                    return true;
                }

                const enableRotation = page.getByRole("button", { name: /enable rotation/i });
                if (await enableRotation.count()) {
                    await enableRotation.click({ timeout: 2_000 }).catch(() => {
                        // The strip re-renders on every fix, so a click can
                        // land on a button that has just been replaced. The
                        // next poll offers it again.
                    });
                }

                return false;
            },
            { timeout: 45_000 }
        )
        .toBe(true);
    await hold(page);

    const samples: { alpha: number; rgb: [number, number, number]; weight: number }[] = [];

    for (const alpha of [0, 90, 180, 270]) {
        // The heartbeat repeats whatever this sets, so the device keeps
        // reporting the heading it was turned to rather than snapping back.
        await page.evaluate((next) => {
            (window as Window & { __arrivalAlpha?: number }).__arrivalAlpha = next;
        }, alpha);
        await dispatchDeviceOrientation(page, alpha);
        // Past the field's own 350 ms, so the sweep has arrived rather than
        // being read halfway through.
        await page.waitForTimeout(900);
        await hold(page);

        const sample = await page.evaluate(() => {
            const field = document.querySelector<HTMLElement>('[data-testid="arrival-field"]')!;
            const image = getComputedStyle(field).backgroundImage;
            const stops = [...image.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/g)];
            return stops.map((stop) => ({
                rgb: [Number(stop[1]), Number(stop[2]), Number(stop[3])] as [number, number, number],
                alpha: stop[4] === undefined ? 1 : Number(stop[4]),
            }));
        });

        expect(sample.length, `the field is not drawing a gradient at alpha ${alpha}`).toBeGreaterThan(0);

        const last = sample[sample.length - 1];
        samples.push({ alpha, rgb: last.rgb, weight: last.alpha });
        console.log(
            `[turn] alpha ${String(alpha).padStart(3)}°  rgb ${last.rgb.join(",").padEnd(11)}  weight ${last.alpha.toFixed(3)}`
        );
    }

    /*
     * Every bearing gets its own colour and any two are told apart — the whole
     * wheel, which is the palette pass's decision (rl-wmn). Narrowing it to
     * the greens was tried there and rejected: half the bearings become
     * indistinguishable and the sweep stops saying anything about turning.
     */
    for (const sample of samples) {
        for (const other of samples) {
            if (sample.alpha === other.alpha) {
                continue;
            }
            expect(
                distanceFrom(sample.rgb, other.rgb),
                `${sample.alpha}° and ${other.alpha}° draw the same colour, ${sample.rgb.join(",")}`
            ).toBeGreaterThan(20);
        }
    }

    /*
     * And north is the palette. The sweep used to run 220 - heading, blue at
     * north for no nameable reason, which is why nothing in the app could be
     * matched to this surface; anchored to `panel`, a walker facing north is
     * standing in exactly the mint the strip beside them is made of.
     */
    const north = samples.find((sample) => sample.alpha === 0)!;
    expect(
        distanceFrom(north.rgb, ANCHOR_RGB),
        `facing north the field is ${north.rgb.join(",")}, not the panel mint ${ANCHOR_RGB.join(",")}`
    ).toBeLessThan(4);

    /*
     * What turning does not do is change the weight. The sweep is a colour and
     * only a colour: a walker turning on the spot has not moved, so the field
     * has no business getting stronger or weaker while they do it. That
     * channel belongs to the walk in.
     */
    const weights = new Set(samples.map((sample) => sample.weight));
    expect(
        weights.size,
        `the field changed strength as it turned: ${[...weights].join(", ")}`
    ).toBe(1);
});
