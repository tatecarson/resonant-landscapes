const ORIENTATION_PERMISSION_KEY = "deviceOrientationPermission";

export function hasStoredOrientationPermission(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(ORIENTATION_PERMISSION_KEY) === "granted";
}

export function persistOrientationPermission(granted: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  if (granted) {
    window.localStorage.setItem(ORIENTATION_PERMISSION_KEY, "granted");
    return;
  }

  window.localStorage.removeItem(ORIENTATION_PERMISSION_KEY);
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
