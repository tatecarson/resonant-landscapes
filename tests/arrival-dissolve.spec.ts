/**
 * The last fifteen metres, walked.
 *
 * rl-879 replaced three visual states with one field, and the thing it fixed
 * cannot be seen in a single frame: the old arrival looked fine at fifteen
 * metres and fine at the centre, and was a hole in between. So this spec walks
 * in and watches the whole approach, which is the only way that class of
 * defect shows up.
 *
 * Two claims are asserted, and they are the two the issue was written around.
 * First, the screen never empties: the strength read off whichever layer owns
 * it — the approach tint outside, the field inside — only ever rises, across
 * the handover included. Second, turning no longer changes the colour: the
 * field leans toward a bearing it holds while the map rotates under it, so the
 * gradient's position moves and its rgb does not.
 *
 * To watch it rather than read it:
 *   npm run sim:arrival:iphone     (headed, held at each step)
 *   npm run demo:arrival           (recorded to a video)
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import stateParks from "../src/data/stateParks.json" with { type: "json" };
import { distanceInMeters, scaleCoordinates, type Coordinate } from "../src/utils/geo.js";
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

/**
 * Whether the field is drawing its lean — one extra gradient over the bloom,
 * and the only thing on screen that says head tracking is live.
 */
async function leanCount(page: Page) {
    return page.evaluate(() => {
        const field = document.querySelector<HTMLElement>('[data-testid="arrival-field"]');
        if (!field) {
            return 0;
        }
        return (getComputedStyle(field).backgroundImage.match(/radial-gradient/g) ?? []).length - 1;
    });
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

    // The map goes as the field comes. Same curve, opposite directions, which
    // is what makes the two read as one motion.
    expect(readings[readings.length - 1].basemap).toBeLessThan(readings[0].basemap);
});

test("turning moves the field without changing its colour", async ({ page, context, baseURL }) => {
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
     * settles and rotation has already auto-enabled, heard nothing and put
     * itself into the blocked state — which is exactly what happened on webkit
     * while this spec was being written.
     */
    await page.evaluate(() => {
        const win = window as Window & {
            __dispatchDeviceOrientation: (a: number, b: number, g: number) => void;
            __arrivalHeartbeatId?: number;
            __arrivalAlpha?: number;
        };
        win.__arrivalAlpha = 0;
        win.__dispatchDeviceOrientation(0, -90, 0);
        win.__arrivalHeartbeatId = window.setInterval(() => {
            win.__dispatchDeviceOrientation(win.__arrivalAlpha ?? 0, -90, 0);
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
     * the field leans.
     *
     * The lean is the right thing to wait for. It is drawn only while head
     * tracking is running, so it is the one on-screen witness that the
     * rotation state actually reached this layer — which is the whole subject
     * of this test.
     */
    await expect
        .poll(
            async () => {
                if (await leanCount(page)) {
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

    const samples: { alpha: number; lean: [number, number]; rotation: number; rgb: string[] }[] = [];

    for (const alpha of [0, 90, 180, 270]) {
        // The heartbeat repeats whatever this sets, so the device keeps
        // reporting the heading it was turned to rather than snapping back.
        await page.evaluate((next) => {
            (window as Window & { __arrivalAlpha?: number }).__arrivalAlpha = next;
        }, alpha);
        await dispatchDeviceOrientation(page, alpha);
        await page.waitForTimeout(600);
        await hold(page);

        const sample = await page.evaluate(() => {
            const field = document.querySelector<HTMLElement>('[data-testid="arrival-field"]')!;
            const image = getComputedStyle(field).backgroundImage;
            const at = image.match(/at\s+([0-9.]+)%\s+([0-9.]+)%/);
            return {
                lean: at ? ([Number(at[1]), Number(at[2])] as [number, number]) : null,
                rgb: [...image.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map(
                    (match) => `${match[1]} ${match[2]} ${match[3]}`
                ),
                rotation: window.__mapDebug?.rotation ?? 0,
            };
        });

        expect(sample.lean, `the field is not leaning at alpha ${alpha}`).not.toBeNull();
        samples.push({ alpha, lean: sample.lean!, rotation: sample.rotation, rgb: sample.rgb });
        console.log(
            `[turn] alpha ${String(alpha).padStart(3)}°  lean ${sample.lean![0].toFixed(1)}% ${sample.lean![1].toFixed(1)}%  map rotation ${sample.rotation.toFixed(3)}`
        );
    }

    // Heading is no longer carried by hue. This is the assertion the old
    // ambient wash could not have passed: its hue was the compass, so every
    // one of these would have been a different colour.
    const colours = new Set(samples.flatMap((sample) => sample.rgb));
    expect(colours.size, `the field changed colour as it turned: ${[...colours].join(" / ")}`).toBe(1);

    // It moved, though, and to four different places.
    const positions = new Set(samples.map((sample) => sample.lean.join(",")));
    expect(positions.size).toBe(samples.length);

    /*
     * And it moved the right way. The lean holds a bearing while the screen
     * turns under it, so its angle clockwise from the top of the screen has to
     * be the map's own rotation — get the sign backwards and the bloom sweeps
     * twice as fast in the wrong direction, which still passes both checks
     * above and is visibly wrong on a walk.
     */
    for (const sample of samples) {
        const leanAngle = Math.atan2(sample.lean[0] - 50, 50 - sample.lean[1]);
        const difference = Math.atan2(
            Math.sin(leanAngle - sample.rotation),
            Math.cos(leanAngle - sample.rotation)
        );
        expect(
            Math.abs(difference),
            `the lean is not holding its bearing at alpha ${sample.alpha}: ` +
                `lean ${leanAngle.toFixed(3)} rad against a map rotation of ${sample.rotation.toFixed(3)}`
        ).toBeLessThan(0.05);
    }
});
