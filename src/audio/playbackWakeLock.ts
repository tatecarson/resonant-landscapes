export type WakeLockStatus = "inactive" | "requesting" | "active" | "error";

export interface WakeLockSentinelLike {
    readonly released: boolean;
    release: () => Promise<void>;
    addEventListener: (type: "release", listener: () => void) => void;
    removeEventListener: (type: "release", listener: () => void) => void;
}

interface PlaybackWakeLockControllerOptions {
    request: () => Promise<WakeLockSentinelLike>;
    getVisibilityState: () => DocumentVisibilityState;
    onStatusChange: (status: WakeLockStatus) => void;
    onError: (message: string | null) => void;
}

export interface PlaybackWakeLockController {
    setDesired: (desired: boolean) => void;
    handleVisibilityChange: () => void;
    dispose: () => void;
}

export function createPlaybackWakeLockController({
    request,
    getVisibilityState,
    onStatusChange,
    onError,
}: PlaybackWakeLockControllerOptions): PlaybackWakeLockController {
    let desired = false;
    let disposed = false;
    let requestInFlight = false;
    let requestGeneration = 0;
    let sentinel: WakeLockSentinelLike | null = null;

    const handleRelease = () => {
        if (!sentinel?.released) return;
        sentinel.removeEventListener("release", handleRelease);
        sentinel = null;
        onStatusChange("inactive");
    };

    const release = async () => {
        requestGeneration += 1;
        const current = sentinel;
        sentinel = null;

        if (current) {
            current.removeEventListener("release", handleRelease);
            if (!current.released) {
                await current.release();
            }
        }

        if (!disposed) {
            onStatusChange("inactive");
        }
    };

    const acquire = async () => {
        if (
            disposed
            || !desired
            || getVisibilityState() !== "visible"
            || sentinel
            || requestInFlight
        ) {
            return;
        }

        const generation = ++requestGeneration;
        requestInFlight = true;
        onError(null);
        onStatusChange("requesting");

        try {
            const nextSentinel = await request();
            if (
                disposed
                || !desired
                || generation !== requestGeneration
                || getVisibilityState() !== "visible"
            ) {
                if (!nextSentinel.released) {
                    await nextSentinel.release();
                }
                return;
            }

            sentinel = nextSentinel;
            sentinel.addEventListener("release", handleRelease);
            onStatusChange("active");
        } catch (error) {
            if (!disposed && generation === requestGeneration) {
                onError(error instanceof Error ? error.message : String(error));
                onStatusChange("error");
            }
        } finally {
            requestInFlight = false;
            if (
                !disposed
                && desired
                && !sentinel
                && getVisibilityState() === "visible"
                && generation !== requestGeneration
            ) {
                void acquire();
            }
        }
    };

    return {
        setDesired(nextDesired) {
            desired = nextDesired;
            if (desired) {
                void acquire();
            } else {
                onError(null);
                void release();
            }
        },
        handleVisibilityChange() {
            if (getVisibilityState() === "visible") {
                void acquire();
            } else {
                void release();
            }
        },
        dispose() {
            disposed = true;
            desired = false;
            void release();
        },
    };
}
