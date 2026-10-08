/**
 * The turn the soundfield follows (rl-vnjn).
 *
 * Rotation used to follow the phone's whole pose, relative to how it was held
 * when rotation came on. Tilting or tipping the phone tipped the recording,
 * and a body turn was misread unless the phone was upright. These hold the
 * replacement: the turn about the vertical, and nothing else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GimbalModule = typeof import("./Gimbal");

const deg = (radians: number) => (radians * 180) / Math.PI;

let Gimbal: GimbalModule["default"];

beforeEach(async () => {
    // Portrait on a phone: window.orientation exists and reads 0.
    vi.stubGlobal("window", { orientation: 0, addEventListener() {}, removeEventListener() {} });
    vi.resetModules();
    Gimbal = (await import("./Gimbal")).default;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function holding(gimbal: InstanceType<typeof Gimbal>) {
    return (sample: { alpha?: number; beta: number; gamma: number; webkitCompassHeading?: number }) => {
        gimbal.onSensorMove({ alpha: sample.alpha ?? 0, ...sample } as never);
        gimbal.update();
        return deg(gimbal.turn);
    };
}

describe("Gimbal.turn", () => {
    it.each([
        ["flat", 0],
        ["at a reading angle", 45],
        ["nearly upright", 80],
    ])("reads a quarter turn right as a quarter turn, held %s", (_label, beta) => {
        const gimbal = new Gimbal();
        const sample = holding(gimbal);
        gimbal.recalibrate();
        sample({ alpha: 100, beta, gamma: 0 });

        // Turning right is alpha going down.
        expect(sample({ alpha: 10, beta, gamma: 0 })).toBeCloseTo(90, 6);
        expect(sample({ alpha: 190, beta, gamma: 0 })).toBeCloseTo(-90, 6);
    });

    it("ignores tilting the phone up or down", () => {
        const gimbal = new Gimbal();
        const sample = holding(gimbal);
        gimbal.recalibrate();
        sample({ alpha: 100, beta: 45, gamma: 0 });

        for (const beta of [0, 20, 60, 85]) {
            expect(sample({ alpha: 100, beta, gamma: 0 })).toBeCloseTo(0, 6);
        }
    });

    it("ignores tipping the phone sideways", () => {
        const gimbal = new Gimbal();
        const sample = holding(gimbal);
        gimbal.recalibrate();
        sample({ alpha: 100, beta: 45, gamma: 0 });

        for (const gamma of [-40, -10, 15, 40]) {
            expect(sample({ alpha: 100, beta: 45, gamma })).toBeCloseTo(0, 6);
        }
    });

    it("follows the iPhone compass where there is one, across north", () => {
        const gimbal = new Gimbal();
        const sample = holding(gimbal);
        gimbal.recalibrate();
        sample({ beta: 45, gamma: 0, webkitCompassHeading: 350 });

        // 350 to 20 is thirty degrees to the right, not 330 to the left.
        expect(sample({ beta: 45, gamma: 0, webkitCompassHeading: 20 })).toBeCloseTo(30, 6);
        expect(sample({ beta: 45, gamma: 0, webkitCompassHeading: 320 })).toBeCloseTo(-30, 6);
    });

    it("starts from wherever the walker faced when rotation came on", () => {
        const gimbal = new Gimbal();
        const sample = holding(gimbal);
        sample({ alpha: 100, beta: 45, gamma: 0 });
        sample({ alpha: 40, beta: 45, gamma: 0 });

        gimbal.recalibrate();
        expect(sample({ alpha: 40, beta: 45, gamma: 0 })).toBeCloseTo(0, 6);
    });
});
