const ORIENTATION_PERMISSION_KEY = "deviceOrientationPermission";

function readStoredOrientationPermission(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(ORIENTATION_PERMISSION_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrientationPermission(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ORIENTATION_PERMISSION_KEY, value);
  } catch {
    // Ignore storage failures and fail closed on later reads.
  }
}

function clearStoredOrientationPermission(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(ORIENTATION_PERMISSION_KEY);
  } catch {
    // Ignore storage failures and keep runtime permission handling non-fatal.
  }
}

export function hasStoredOrientationPermission(): boolean {
  return readStoredOrientationPermission() === "granted";
}

export function persistOrientationPermission(granted: boolean): void {
  if (granted) {
    writeStoredOrientationPermission("granted");
    return;
  }

  clearStoredOrientationPermission();
}

/**
 * Watch for orientation events actually arriving after the gimbal is enabled.
 *
 * The stored "granted" flag can lie: iOS may have revoked the grant since it
 * was written, and the app then attaches listeners that never fire, leaving a
 * "tracking" label over spatial audio that does not move and no way back. If
 * nothing arrives within the timeout, the stale flag is cleared so the next
 * session prompts again instead of silently repeating the failure.
 *
 * Returns a cleanup function.
 */
export function watchOrientationAvailability(
  onUnavailable?: () => void,
  timeoutMs = 1500
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let settled = false;

  const onOrientation = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };

  const timer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    clearStoredOrientationPermission();
    onUnavailable?.();
  }, timeoutMs);

  function cleanup() {
    window.clearTimeout(timer);
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("deviceorientationabsolute", onOrientation);
  }

  window.addEventListener("deviceorientation", onOrientation);
  window.addEventListener("deviceorientationabsolute", onOrientation);

  return cleanup;
}

/**
 * Ask iOS for the compass, for the map's sake, from the Start tap.
 *
 * Without this the only request was the Enable rotation button at a
 * listening spot, so on an iPhone no orientation event arrived on the way
 * there. The map then turned only from the GPS course, which needs a brisk
 * walk, and fell back to north whenever the walker slowed: the arrow was
 * right some of the time and wrong the rest, on the stretch where it is
 * the only thing pointing at the next spot (rl-d0z).
 *
 * Nothing is stored. The stored grant is what auto-enables head rotation at
 * a spot, and that stays the walker's choice; asking again from Enable
 * rotation answers at once without a second prompt.
 *
 * Must be called inside the tap itself: iOS refuses the request otherwise.
 * Elsewhere there is nothing to ask, and this does nothing.
 */
export function requestCompassForMap(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
    return Promise.resolve(false);
  }

  const DOE = DeviceOrientationEvent as IOSDeviceOrientationEvent;
  if (typeof DOE.requestPermission !== "function") {
    return Promise.resolve(true);
  }

  try {
    return DOE.requestPermission().then(
      (permission) => permission === "granted",
      () => false
    );
  } catch {
    return Promise.resolve(false);
  }
}

export async function requestDeviceOrientationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
    return false;
  }

  const DOE = DeviceOrientationEvent as IOSDeviceOrientationEvent;

  if (typeof DOE.requestPermission === "function") {
    try {
      const permission = await DOE.requestPermission();
      const granted = permission === "granted";
      persistOrientationPermission(granted);
      return granted;
    } catch (error) {
      console.error("DeviceOrientationEvent.requestPermission error:", error);
      persistOrientationPermission(false);
      return false;
    }
  }

  persistOrientationPermission(true);
  return true;
}
