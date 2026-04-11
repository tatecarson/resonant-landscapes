import { useEffect, useRef } from "react";

type RenderTrackedValues = Record<string, unknown>;

function shallowChangedKeys(
  previous: RenderTrackedValues | null,
  next: RenderTrackedValues
) {
  if (!previous) {
    return Object.keys(next);
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  const changed: string[] = [];

  for (const key of keys) {
    if (previous[key] !== next[key]) {
      changed.push(key);
    }
  }

  return changed;
}

function isRenderDebugEnabled() {
  return import.meta.env.DEV && window.location.hash.includes("/debug");
}

export function useRenderDebug(componentName: string, trackedValues: RenderTrackedValues) {
  const previousValuesRef = useRef<RenderTrackedValues | null>(null);

  useEffect(() => {
    if (!isRenderDebugEnabled()) {
      return;
    }

    const changedKeys = shallowChangedKeys(previousValuesRef.current, trackedValues);
    const previousEntry = window.__renderDebug?.[componentName];
    const renderCount = (previousEntry?.renderCount ?? 0) + 1;

    window.__renderDebug = {
      ...(window.__renderDebug ?? {}),
      [componentName]: {
        renderCount,
        changedKeys,
        lastRenderedAt: Date.now(),
      },
    };

    previousValuesRef.current = trackedValues;
  });
}
