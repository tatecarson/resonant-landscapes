import { describe, expect, it, vi } from "vitest";
import {
    createPlaybackWakeLockController,
    type WakeLockSentinelLike,
    type WakeLockStatus,
} from "./playbackWakeLock";

function createSentinel() {
    const listeners = new Set<() => void>();
    const sentinel: WakeLockSentinelLike = {
        released: false,
        release: vi.fn(async () => {
            Object.defineProperty(sentinel, "released", { value: true });
            listeners.forEach((listener) => listener());
        }),
        addEventListener: (_type, listener) => listeners.add(listener),
        removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    return sentinel;
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

describe("createPlaybackWakeLockController", () => {
    it("holds a wake lock only while playback wants it", async () => {
        const sentinel = createSentinel();
        const statuses: WakeLockStatus[] = [];
        const controller = createPlaybackWakeLockController({
            request: vi.fn(async () => sentinel),
            getVisibilityState: () => "visible",
            onStatusChange: (status) => statuses.push(status),
            onError: vi.fn(),
        });

        controller.setDesired(true);
        await flushPromises();
        expect(statuses).toEqual(["requesting", "active"]);

        controller.setDesired(false);
        await flushPromises();
        expect(sentinel.release).toHaveBeenCalledOnce();
        expect(statuses.at(-1)).toBe("inactive");
    });

    it("releases while hidden and reacquires when visible", async () => {
        let visibility: DocumentVisibilityState = "visible";
        const first = createSentinel();
        const second = createSentinel();
        const request = vi.fn()
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(second);
        const controller = createPlaybackWakeLockController({
            request,
            getVisibilityState: () => visibility,
            onStatusChange: vi.fn(),
            onError: vi.fn(),
        });

        controller.setDesired(true);
        await flushPromises();

        visibility = "hidden";
        controller.handleVisibilityChange();
        await flushPromises();
        expect(first.release).toHaveBeenCalledOnce();

        visibility = "visible";
        controller.handleVisibilityChange();
        await flushPromises();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it("releases a late request result after playback stops", async () => {
        const sentinel = createSentinel();
        let resolveRequest: ((value: WakeLockSentinelLike) => void) | undefined;
        const request = vi.fn(() => new Promise<WakeLockSentinelLike>((resolve) => {
            resolveRequest = resolve;
        }));
        const controller = createPlaybackWakeLockController({
            request,
            getVisibilityState: () => "visible",
            onStatusChange: vi.fn(),
            onError: vi.fn(),
        });

        controller.setDesired(true);
        controller.setDesired(false);
        resolveRequest?.(sentinel);
        await flushPromises();

        expect(sentinel.release).toHaveBeenCalledOnce();
    });
});
