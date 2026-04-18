import type { Page } from "@playwright/test";

/**
 * Playwright's context.setGeolocation() only provides lat/lon. The app reads
 * map-rotation heading from Geolocation.coords.heading, which Playwright
 * leaves null. This shim wraps navigator.geolocation.watchPosition /
 * getCurrentPosition so every emitted position carries a heading (and speed)
 * synthesized from the delta to the previous fix.
 */
export async function seedGeolocationHeadingShim(page: Page) {
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    if (!geo) return;

    const EARTH_RADIUS_M = 6_371_000;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const toDeg = (v: number) => (v * 180) / Math.PI;

    const bearingDeg = (
      from: { latitude: number; longitude: number },
      to: { latitude: number; longitude: number }
    ) => {
      const φ1 = toRad(from.latitude);
      const φ2 = toRad(to.latitude);
      const Δλ = toRad(to.longitude - from.longitude);
      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x =
        Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    };

    const haversineM = (
      from: { latitude: number; longitude: number },
      to: { latitude: number; longitude: number }
    ) => {
      const φ1 = toRad(from.latitude);
      const φ2 = toRad(to.latitude);
      const Δφ = toRad(to.latitude - from.latitude);
      const Δλ = toRad(to.longitude - from.longitude);
      const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    let prevLat: number | null = null;
    let prevLon: number | null = null;
    let prevTs = 0;
    let lastHeading: number | null = null;

    const augment = (pos: GeolocationPosition): GeolocationPosition => {
      const { latitude, longitude } = pos.coords;
      let heading: number | null = lastHeading;
      let speed: number | null = null;

      if (prevLat !== null && prevLon !== null) {
        const dist = haversineM(
          { latitude: prevLat, longitude: prevLon },
          { latitude, longitude }
        );
        if (dist > 0.05) {
          heading = bearingDeg(
            { latitude: prevLat, longitude: prevLon },
            { latitude, longitude }
          );
          const dt = (pos.timestamp - prevTs) / 1000;
          if (dt > 0) speed = dist / dt;
        }
      }

      prevLat = latitude;
      prevLon = longitude;
      prevTs = pos.timestamp;
      lastHeading = heading;

      return {
        coords: {
          latitude,
          longitude,
          accuracy: pos.coords.accuracy ?? 5,
          altitude: pos.coords.altitude,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading,
          speed,
          toJSON: () => ({}),
        } as GeolocationCoordinates,
        timestamp: pos.timestamp,
        toJSON: () => ({}),
      } as GeolocationPosition;
    };

    const originalWatch = geo.watchPosition.bind(geo);
    const originalGet = geo.getCurrentPosition.bind(geo);

    geo.watchPosition = function (
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      options?: PositionOptions
    ) {
      return originalWatch(
        (pos) => success(augment(pos)),
        error ?? undefined,
        options
      );
    };

    geo.getCurrentPosition = function (
      success: PositionCallback,
      error?: PositionErrorCallback | null,
      options?: PositionOptions
    ) {
      return originalGet(
        (pos) => success(augment(pos)),
        error ?? undefined,
        options
      );
    };
  });
}
