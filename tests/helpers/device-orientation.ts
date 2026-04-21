import type { Page } from "@playwright/test";

type GeoPoint = {
  latitude: number;
  longitude: number;
};

export async function seedDeviceOrientationHarness(page: Page) {
  await page.addInitScript(() => {
    const orientationHandlers = new Map<string, EventListenerOrEventListenerObject[]>();
    const originalAddEventListener = window.addEventListener.bind(window);
    const deviceOrientationCtor = window.DeviceOrientationEvent as IOSDeviceOrientationEvent | undefined;

    if (deviceOrientationCtor && typeof deviceOrientationCtor.requestPermission === "function") {
      Object.defineProperty(deviceOrientationCtor, "requestPermission", {
        configurable: true,
        value: async () => "granted",
      });
    }

    window.addEventListener = function (
      type: string,
      handler: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      if (type === "deviceorientation" || type === "deviceorientationabsolute") {
        const handlers = orientationHandlers.get(type) ?? [];
        handlers.push(handler);
        orientationHandlers.set(type, handlers);
      }

      return originalAddEventListener(type, handler, options);
    };

    (window as unknown as Record<string, unknown>).__dispatchDeviceOrientation = (
      alpha: number,
      beta: number,
      gamma: number
    ) => {
      const dispatch = (type: "deviceorientation" | "deviceorientationabsolute", absolute: boolean) => {
        const event = {
          alpha,
          beta,
          gamma,
          absolute,
          webkitCompassHeading: (360 - alpha + 360) % 360,
        } as DeviceOrientationEvent & { webkitCompassHeading?: number };

        (orientationHandlers.get(type) ?? []).forEach((handler) => {
          if (typeof handler === "function") {
            handler(event);
            return;
          }

          handler.handleEvent(event);
        });
      };

      dispatch("deviceorientation", false);
      dispatch("deviceorientationabsolute", true);
    };
  });
}

export async function dispatchDeviceOrientation(
  page: Page,
  alpha: number,
  beta = -90,
  gamma = 0
) {
  await page.evaluate(
    ({ nextAlpha, nextBeta, nextGamma }) => {
      (window as Window & {
        __dispatchDeviceOrientation: (alpha: number, beta: number, gamma: number) => void;
      }).__dispatchDeviceOrientation(nextAlpha, nextBeta, nextGamma);
    },
    { nextAlpha: alpha, nextBeta: beta, nextGamma: gamma }
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function shortestAngularDelta(from: number, to: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return delta;
}

export async function rotateDeviceOrientation(
  page: Page,
  from: number,
  to: number,
  options: { durationMs?: number; stepDegrees?: number } = {}
) {
  const durationMs = Math.max(0, options.durationMs ?? 600);
  const stepDegrees = Math.max(0.5, options.stepDegrees ?? 5);
  const delta = shortestAngularDelta(from, to);

  if (durationMs === 0 || Math.abs(delta) < 0.5) {
    await dispatchDeviceOrientation(page, to);
    return;
  }

  const steps = Math.max(1, Math.ceil(Math.abs(delta) / stepDegrees));
  const tickMs = durationMs / steps;

  for (let i = 1; i <= steps; i += 1) {
    const alpha = ((from + (delta * i) / steps) + 360) % 360;
    await dispatchDeviceOrientation(page, alpha);
    if (i < steps) {
      await page.waitForTimeout(tickMs);
    }
  }
}

export function headingBetweenPoints(from: GeoPoint, to: GeoPoint) {
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);

  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);

  const bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}
