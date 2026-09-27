import { describe, expect, it } from "vitest";
import * as copy from "./copy";
import { RECOVERY_STAKES, RECOVERY_TITLES, getRecoverySteps } from "./utils/recoverySteps";
import { readPreflightEnv, runPreflight } from "./utils/capabilities";

/**
 * Walk every string the module exposes, including the ones behind functions,
 * so a rule added later cannot hide from these checks.
 */
function collectStrings(value: unknown, path = "copy"): [string, string][] {
    if (typeof value === "string") return [[path, value]];
    if (typeof value === "function") {
        // Call with arguments that exercise both branches of the few
        // conditional strings. A signature that outgrows this will throw here
        // rather than quietly stop being covered.
        const samples: unknown[][] = [
            ["dsu"],
            ["terrace"],
            ["chatham"],
            [30, 15],
            [null, 15],
            [12],
            [2, 16],
            ["4.2", true],
            ["4.2", false],
            ["Hartford Beach State Park", 120, "NE"],
            ["Hartford Beach State Park", 120, "north east"],
        ];
        const out: [string, string][] = [];
        for (const args of samples) {
            try {
                const result = (value as (...a: unknown[]) => unknown)(...args);
                if (typeof result === "string") out.push([`${path}()`, result]);
            } catch {
                // Wrong arity for this sample; another one will fit.
            }
        }
        expect(out.length, `${path} produced no strings from any sample arguments`).toBeGreaterThan(0);
        return out;
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, child]) =>
            collectStrings(child, `${path}.${key}`)
        );
    }
    return [];
}

/** Everything a walker can read, wherever it is defined. */
function allWalkerCopy(): [string, string][] {
    const strings = collectStrings(copy);

    for (const capability of ["location", "orientation"] as const) {
        for (const ua of ["iPhone", "Android", "Macintosh"]) {
            getRecoverySteps(capability, ua).forEach((step, index) =>
                strings.push([`recoverySteps.${capability}.${ua}[${index}]`, step])
            );
        }
        strings.push([`RECOVERY_TITLES.${capability}`, RECOVERY_TITLES[capability]]);
        strings.push([`RECOVERY_STAKES.${capability}`, RECOVERY_STAKES[capability]]);
    }

    runPreflight(readPreflightEnv({})).checks.forEach((check) => {
        strings.push([`capability.${check.id}.label`, check.label]);
        strings.push([`capability.${check.id}.detail`, check.detail]);
    });

    return strings;
}

/** URLs and mailto: links are addresses, not prose. */
const isProse = ([, text]: [string, string]) => !/^(https?:|mailto:)/.test(text);

describe("walker-facing copy", () => {
    const strings = allWalkerCopy().filter(isProse);

    it("covers every string in the module", () => {
        // A floor, so a future refactor that silently empties the module is
        // caught rather than making every check below vacuously pass.
        expect(strings.length).toBeGreaterThan(60);
    });

    it("uses no em or en dashes", () => {
        // They read as an AI tell and never survive a phone's narrow column.
        // A sentence that needs one needs to be two sentences.
        const offenders = strings.filter(([, text]) => /[—–]/.test(text));
        expect(offenders).toEqual([]);
    });

    it("uses straight quotes", () => {
        const offenders = strings.filter(([, text]) => /[“”‘]/.test(text));
        expect(offenders).toEqual([]);
    });

    it("avoids words no walker would say out loud", () => {
        // Names of web APIs and internal machinery. The walker knows "sound",
        // "turning" and "location"; they do not know what a context is.
        const jargon =
            /\b(AudioContext|DeviceOrientation|Web Audio|geolocation API|decodeAudioData|buffer|cache|prefetch|payload|downmix|render|viewport|callback)\b/i;
        const offenders = strings.filter(([, text]) => jargon.test(text));
        expect(offenders).toEqual([]);
    });

    it("keeps sentences short enough to read while walking", () => {
        // Long sentences are the first thing to fail outdoors, on a small
        // screen, in motion. Numbered recovery steps get more room because
        // they carry a settings path.
        const offenders = strings.filter(([path, text]) => {
            const limit = path.startsWith("recoverySteps") ? 220 : 170;
            return text.split(/(?<=[.?!])\s+/).some((sentence) => sentence.length > limit);
        });
        expect(offenders).toEqual([]);
    });

    it("never tells a walker to move away from buildings", () => {
        // The listening spots sit against buildings. Advice that cannot be
        // followed from where the piece asked them to stand implies they are
        // doing something wrong.
        const offenders = strings.filter(([, text]) => /away from buildings/i.test(text));
        expect(offenders).toEqual([]);
    });
});

describe("welcome.location", () => {
    // The note on the welcome screen and the "Location is blocked" steps name
    // the same switches. If one moves, the walker is sent two places.
    it("names the same Settings path as the iPhone recovery steps", () => {
        const recoveryPath = "Settings → Privacy & Security → Location Services";
        expect(copy.welcome.location.body.ios).toContain(recoveryPath);
        expect(copy.recovery.steps.location.ios.join(" ")).toContain(recoveryPath);
        // The recovery steps say where Safari Websites is and what it must
        // not be set to. The welcome note leaves it out: on a real iPhone,
        // Never still let Safari ask, so it is a fallback, not a first step.
        const recovery = copy.recovery.steps.location.ios.join(" ");
        expect(recovery).toContain("scroll down");
        expect(recovery).toContain("Safari Websites");
        expect(recovery).toContain("Never");
    });

    it("names the same Settings path as the Android recovery steps", () => {
        const recoveryPath = "Settings → Location";
        expect(copy.welcome.location.body.android).toContain(recoveryPath);
        expect(copy.recovery.steps.location.android.join(" ")).toContain(recoveryPath);

describe("location", () => {
    // A walker with location off in Settings, standing outside, was told to
    // step outside (rl-edv.1). Nothing says so before anything has failed.
    it("does not tell a walker to go outside while it is still looking", () => {
        expect(copy.location.acquiring.detail).not.toMatch(/outside|outdoors/i);
    });

    it("leads the no-location messages with the cause moving cannot fix", () => {
        for (const { detail } of [copy.location.timeout, copy.location.failed]) {
            expect(detail).toMatch(/turned off/);
            expect(detail).not.toMatch(/outside|outdoors/i);
        }
    });

    it("gives Settings taps for each phone, ending with a reload", () => {
        for (const steps of Object.values(copy.location.notFoundSteps)) {
            expect(steps.length).toBeGreaterThanOrEqual(2);
            expect(steps[steps.length - 1]).toMatch(/reload the page/);
        }
        const ios = copy.location.notFoundSteps.ios.join(" ");
        // The switch the welcome screen's note names, first.
        expect(copy.welcome.location.body.ios).toContain("Settings → Privacy & Security → Location Services");
        expect(copy.location.notFoundSteps.ios[0]).toContain("Settings → Privacy & Security → Location Services");
        // Then the fallback the recovery steps also give.
        expect(ios).toContain("scroll down to Safari Websites and make sure it isn't set to Never");
        expect(copy.location.notFoundSteps.android.join(" ")).toContain("Settings → Location");
    });

    it("keeps the indoors advice, with its reason, as the second thing to try", () => {
        expect(copy.location.outdoorsHint).toMatch(/^Indoors\?/);
        expect(copy.location.outdoorsHint).toMatch(/GPS works best outdoors/);
    });

    it("keeps the mid-walk messages free of advice to go outside", () => {
        expect(copy.location.stale.detail).not.toMatch(/outside|outdoors/i);
        expect(copy.location.imprecise.detail(12, 15)).not.toMatch(/outside|outdoors/i);
    });
});
