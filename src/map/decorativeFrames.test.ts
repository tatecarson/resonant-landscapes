import { describe, expect, it } from "vitest";
import { createDecorativeFrameScheduler } from "./decorativeFrames";

/**
 * A controllable stand-in for setTimeout, so the pacing can be asserted
 * without waiting for real frames.
 */
function fakeClock() {
    const pending = new Map<number, { callback: () => void; delayMs: number }>();
    let nextHandle = 1;

    return {
        schedule: (callback: () => void, delayMs: number) => {
            const handle = nextHandle++;
            pending.set(handle, { callback, delayMs });
            return handle;
        },
        cancel: (handle: number) => {
            pending.delete(handle);
        },
        /** Run every pending callback, as if their delays had elapsed. */
        tick() {
            const due = [...pending.entries()];
            pending.clear();
            for (const [, { callback }] of due) {
                callback();
            }
        },
        get scheduledCount() {
            return pending.size;
        },
        get lastDelay() {
            return [...pending.values()].at(-1)?.delayMs ?? null;
        },
    };
}

function setup({ hidden = false, active = true, frameMs = 33 } = {}) {
    const clock = fakeClock();
    const state = { hidden, active, redraws: 0 };
    const layer = {
        changed: () => {
            state.redraws += 1;
        },
    };

    const scheduler = createDecorativeFrameScheduler({
        frameMs,
        isHidden: () => state.hidden,
        isActive: () => state.active,
        schedule: clock.schedule,
        cancel: clock.cancel,
    });

    return { clock, state, layer, scheduler };
}

describe("createDecorativeFrameScheduler", () => {
    it("redraws once per frame interval rather than immediately", () => {
        const { clock, state, layer, scheduler } = setup();

        scheduler.request(layer);

        // The point of the whole thing: the redraw is deferred, not immediate.
        expect(state.redraws).toBe(0);
        expect(clock.lastDelay).toBe(33);

        clock.tick();
        expect(state.redraws).toBe(1);
    });

    it("coalesces repeat requests inside one frame", () => {
        const { clock, state, layer, scheduler } = setup();

        scheduler.request(layer);
        scheduler.request(layer);
        scheduler.request(layer);

        expect(clock.scheduledCount).toBe(1);

        clock.tick();
        expect(state.redraws).toBe(1);
    });

    it("schedules nothing while the page is hidden", () => {
        const { clock, state, layer, scheduler } = setup({ hidden: true });

        scheduler.request(layer);

        // A phone in a pocket with the screen off must not be repainting a map.
        expect(clock.scheduledCount).toBe(0);
        expect(state.redraws).toBe(0);
    });

    it("drops a frame that comes due after the page is hidden", () => {
        const { clock, state, layer, scheduler } = setup();

        scheduler.request(layer);
        state.hidden = true;
        clock.tick();

        expect(state.redraws).toBe(0);
    });

    it("drops a frame that comes due after the layer goes inactive", () => {
        const { clock, state, layer, scheduler } = setup();

        scheduler.request(layer);
        state.active = false;
        clock.tick();

        expect(state.redraws).toBe(0);
    });

    it("restarts the animation on resume once visible again", () => {
        const { clock, state, layer, scheduler } = setup({ hidden: true });

        scheduler.request(layer);
        state.hidden = false;
        scheduler.resume();

        // Paused means no postrender events arrive, so nothing else could
        // restart it — resume has to redraw directly.
        expect(state.redraws).toBe(1);
        expect(clock.scheduledCount).toBe(0);
    });

    it("ignores resume while still hidden or inactive", () => {
        const { state, layer, scheduler } = setup({ hidden: true });

        scheduler.request(layer);
        scheduler.resume();
        expect(state.redraws).toBe(0);

        state.hidden = false;
        state.active = false;
        scheduler.resume();
        expect(state.redraws).toBe(0);
    });

    it("does not double up when resume races a pending frame", () => {
        const { clock, state, layer, scheduler } = setup();

        scheduler.request(layer);
        scheduler.resume();

        expect(state.redraws).toBe(0);
        clock.tick();
        expect(state.redraws).toBe(1);
    });

    it("cancels a pending frame on dispose", () => {
        const { clock, state, layer, scheduler } = setup();

        scheduler.request(layer);
        scheduler.dispose();
        clock.tick();

        expect(clock.scheduledCount).toBe(0);
        expect(state.redraws).toBe(0);
    });

    it("ignores a missing layer", () => {
        const { clock, scheduler } = setup();

        scheduler.request(null);
        scheduler.request(undefined);

        expect(clock.scheduledCount).toBe(0);
    });
});
