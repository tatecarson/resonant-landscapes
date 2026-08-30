import { describe, expect, it } from "vitest";
import {
    RECOVERY_STAKES,
    RECOVERY_TITLES,
    detectPlatform,
    getRecoverySteps,
} from "./recoverySteps";

const IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
    "Mozilla/5.0 (Linux; Android 13; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const DESKTOP =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
    it("recognises iPhone and Android", () => {
        expect(detectPlatform(IOS)).toBe("ios");
        expect(detectPlatform(ANDROID)).toBe("android");
    });

    it("falls back to generic wording for anything else", () => {
        expect(detectPlatform(DESKTOP)).toBe("other");
        expect(detectPlatform("")).toBe("other");
    });

    it("does not mistake Android Chrome for iOS", () => {
        // Both UAs carry "AppleWebKit"; only one is an iPhone.
        expect(detectPlatform(ANDROID)).not.toBe("ios");
    });
});

describe("getRecoverySteps", () => {
    it("gives iOS walkers the Safari path for location", () => {
        const steps = getRecoverySteps("location", IOS);

        expect(steps.join(" ")).toMatch(/Website Settings/);
        expect(steps.join(" ")).toMatch(/Location Services/);
    });

    it("gives Android walkers the Chrome path for location", () => {
        expect(getRecoverySteps("location", ANDROID).join(" ")).toMatch(/Chrome/);
    });

    it("never sends iOS walkers to the switch Apple deleted in iOS 13", () => {
        const steps = getRecoverySteps("orientation", IOS).join(" ");

        // "Motion & Orientation Access" was a Settings → Safari row on iOS 12
        // and has not existed since iOS 13, which is four majors below this
        // app's iOS 15 floor. Clearing the site's stored answer is what makes
        // Safari prompt again.
        expect(steps).toMatch(/Website Data/);
        expect(steps).not.toMatch(/Motion & Orientation Access/);
    });

    it("tells iOS walkers to keep Precise Location on", () => {
        // A city-level fix cannot resolve a 15 m listening area, so an allowed
        // but imprecise site fails in a way that looks like a broken walk.
        expect(getRecoverySteps("location", IOS).join(" ")).toMatch(/Precise Location/);
    });

    it("always ends somewhere the walker can act", () => {
        // Every path must finish with a concrete next move, not a diagnosis.
        for (const capability of ["location", "orientation"] as const) {
            for (const ua of [IOS, ANDROID, DESKTOP]) {
                const steps = getRecoverySteps(capability, ua);
                expect(steps.length).toBeGreaterThanOrEqual(2);
                expect(steps[steps.length - 1]).toMatch(/reload|Enable Rotation|Allow|works/i);
            }
        }
    });

    it("says what is at stake differently for the two capabilities", () => {
        // Losing location ends the walk; losing rotation does not, and telling
        // someone outdoors that it does would be a lie.
        expect(RECOVERY_STAKES.location).toMatch(/nothing will play/i);
        expect(RECOVERY_STAKES.orientation).toMatch(/still works/i);
        expect(RECOVERY_TITLES.location).not.toBe(RECOVERY_TITLES.orientation);
    });
});
