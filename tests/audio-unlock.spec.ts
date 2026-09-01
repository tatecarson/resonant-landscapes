/**
 * The Start gesture has to resume a suspended AudioContext.
 *
 * Written for rl-0p1 after a mutation pass: replacing the suspended-state
 * check in unlockAudio with `if (false)` left the entire suite green. Start
 * still reported success, still primed the context, still set isAudioUnlocked,
 * and the walk would have been silent on a real phone.
 *
 * Nothing caught it because the test browser never suspends its context. The
 * autoplay gate is what makes the whole unlock dance necessary, and it is the
 * one thing headless Chromium does not do, so the branch under test was never
 * entered. This spec supplies the missing condition rather than hoping for it:
 * AudioContext is patched to report "suspended" until resume() is called, which
 * is what an iPhone does before the first gesture.
 */
import { expect, test, type Page } from "@playwright/test";

type UnlockProbe = {
    /** Total resume() calls, across every code path. */
    calls: number;
    /** Reset by the test immediately before the Start click. */
    sinceMark: number;
    mark(): void;
};

declare global {
    interface Window {
        __unlockProbe?: UnlockProbe;
    }
}

/**
 * Make the context behave like one the browser has withheld: state reads
 * "suspended" until something resumes it, and every resume is counted.
 */
async function suspendUntilResumed(page: Page) {
    await page.addInitScript(() => {
        // `state` is declared on BaseAudioContext; `resume` on AudioContext.
        // Patching both on AudioContext.prototype silently finds neither.
        const stateProto = window.BaseAudioContext.prototype;
        const resumeProto = window.AudioContext.prototype;
        const realState = Object.getOwnPropertyDescriptor(stateProto, "state");
        const realResume = resumeProto.resume;
        if (!realState?.get) {
            throw new Error("AudioContext.state descriptor not found; probe would silently pass");
        }

        let resumed = false;
        const probe: UnlockProbe = {
            calls: 0,
            sinceMark: 0,
            mark() {
                probe.sinceMark = 0;
            },
        };
        window.__unlockProbe = probe;

        Object.defineProperty(stateProto, "state", {
            configurable: true,
            get(this: AudioContext) {
                return resumed ? realState.get!.call(this) : "suspended";
            },
        });

        resumeProto.resume = function (this: AudioContext) {
            probe.calls += 1;
            probe.sinceMark += 1;
            resumed = true;
            return realResume.call(this);
        };
    });
}

const probe = (page: Page) =>
    page.evaluate(() => ({
        calls: window.__unlockProbe?.calls ?? -1,
        sinceMark: window.__unlockProbe?.sinceMark ?? -1,
    }));

test("Start resumes a context the browser had suspended", async ({ page }) => {
    await suspendUntilResumed(page);
    await page.goto("/");

    const start = page.getByRole("button", { name: /^\s*start\s*$/i });
    await expect(start).toBeVisible({ timeout: 15_000 });

    // Count only what the gesture causes. The engine resumes the context on
    // its own elsewhere, and crediting those would pass with the unlock gone.
    await page.evaluate(() => window.__unlockProbe?.mark());
    await start.click();

    await expect
        .poll(async () => (await probe(page)).sinceMark, {
            timeout: 15_000,
            message: "Start never resumed the suspended context",
        })
        .toBeGreaterThan(0);
});

test("the walk does not claim to be unlocked without resuming", async ({ page }) => {
    // The failure this guards is specifically a silent one: the app said yes.
    // Reporting unlocked while the context is still suspended is the state a
    // walker cannot diagnose, because every control looks live.
    await suspendUntilResumed(page);
    await page.goto("/");

    const start = page.getByRole("button", { name: /^\s*start\s*$/i });
    await expect(start).toBeVisible({ timeout: 15_000 });
    await start.click();

    await expect
        .poll(() => page.evaluate(() => window.__audioDebug?.isAudioUnlocked ?? false), {
            timeout: 15_000,
        })
        .toBe(true);

    const { calls } = await probe(page);
    expect(calls, "reported unlocked without ever resuming").toBeGreaterThan(0);
});
