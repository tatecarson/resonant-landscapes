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
