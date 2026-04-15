# ProximityMarkers Breathing Halo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a breathing/pulsing halo animation around the park center marker on the OL map canvas when the user enters the park's 15m boundary, intensifying as the user approaches within 2m where AmbientGradient takes over.

**Architecture:** A new `ProximityMarkers` OL canvas component (same postrender pattern as `ProximityRingLayer`) draws the halo at the park's lon/lat pixel position. The hook exports `currentParkLocation` so the component always has the active park's coordinates. `LeavesCanvas` is removed from `HoaRenderer` as it's being superseded by the map-layer animation.

**Tech Stack:** React, OpenLayers via rlayers (`RLayerVector`, `onPostRender`, `useOL`), `fromLonLat`/`getPointResolution` from `ol/proj`, `CanvasRenderingContext2D`.

---

### Task 1: Export `currentParkLocation` from `useGeolocationTracking`

**Files:**
- Modify: `src/hooks/useGeolocationTracking.ts:181-196`

The hook already tracks `currentParkLocation` in state but doesn't include it in the return object.

**Step 1: Add `currentParkLocation` to the return value**

In `useGeolocationTracking.ts`, the `return` block at line 181 currently ends at:
```ts
    return {
        accuracy,
        debugPermission,
        enterDistance,
        exitDistance,
        onGeolocationChange,
        parkDistance,
        parkFeatures,
        parkName,
        prefetchParkName,
        prefetchParkCoords,
        prefetchParkDistance,
        prefetchParks,
        position,
        userOrientationEnabled,
    };
```

Add `currentParkLocation` to this object:
```ts
    return {
        accuracy,
        currentParkLocation,
        debugPermission,
        enterDistance,
        exitDistance,
        onGeolocationChange,
        parkDistance,
        parkFeatures,
        parkName,
        prefetchParkName,
        prefetchParkCoords,
        prefetchParkDistance,
        prefetchParks,
        position,
        userOrientationEnabled,
    };
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/tate.carson/other_websites/resonant-landscapes
npx tsc --noEmit
```

Expected: no errors (or only pre-existing ones).

**Step 3: Commit**

```bash
git add src/hooks/useGeolocationTracking.ts
git commit -m "feat: export currentParkLocation from useGeolocationTracking"
```

---

### Task 2: Create `ProximityMarkers` component

**Files:**
- Create: `src/components/ProximityMarkers.tsx`

This component follows the same pattern as `ProximityRingLayer.tsx` — it mounts an `RLayerVector`, hooks into `onPostRender`, and draws directly on the OL canvas. It draws a breathing halo centered on the active park's map pixel.

**Step 1: Write the component**

Create `src/components/ProximityMarkers.tsx`:

```tsx
import { useCallback } from "react";
import { fromLonLat } from "ol/proj";
import type RenderEvent from "ol/render/Event";
import { RLayerVector, useOL } from "rlayers";

type Coordinate = [number, number];

interface ProximityMarkersProps {
    parkCoords: Coordinate;   // [lon, lat] of the active park center
    parkDistance: number;     // meters from user to park center
    active: boolean;          // true when inside park AND parkDistance >= 2
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
    return outMin + t * (outMax - outMin);
}

export default function ProximityMarkers({ parkCoords, parkDistance, active }: ProximityMarkersProps) {
    const { map } = useOL();

    const handlePostrender = useCallback((event: RenderEvent) => {
        if (!active || !map) return;
        if (!(event.context instanceof CanvasRenderingContext2D)) return;

        const ctx = event.context;
        const dpr = event.frameState?.pixelRatio ?? window.devicePixelRatio ?? 1;
        const t = Date.now() / 1000;

        const projectedCoords = fromLonLat(parkCoords);
        const pixel = map.getPixelFromCoordinate(projectedCoords);
        if (!pixel) return;

        const cx = pixel[0] * dpr;
        const cy = pixel[1] * dpr;

        // Speed increases as user gets closer (15m → 2m maps to 0.8 → 3.5 rad/s)
        const speed = mapRange(parkDistance, 15, 2, 0.8, 3.5);

        // Halo radius breathes: 8 ± 6 screen pixels (scaled by dpr)
        const radius = (8 + Math.sin(t * speed) * 6) * dpr;

        // Alpha breathes in sync: 0.4 → 0.7
        const alpha = 0.4 + 0.25 * Math.sin(t * speed);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(142, 205, 192, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2.5 * dpr;
        ctx.stroke();
        ctx.restore();

        event.target?.changed();
    }, [active, parkCoords, parkDistance, map]);

    return (
        <RLayerVector
            zIndex={12}
            onPostRender={handlePostrender}
        />
    );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/components/ProximityMarkers.tsx
git commit -m "feat: add ProximityMarkers breathing halo component"
```

---

### Task 3: Wire `ProximityMarkers` into `GeolocationMap.tsx`

**Files:**
- Modify: `src/components/GeolocationMap.tsx`

`GeolocationTrackingController` at line 138 destructures from `useGeolocationTracking`. We need to add `currentParkLocation`, import `ProximityMarkers`, and render it.

**Step 1: Add import**

Add to the imports at the top of `GeolocationMap.tsx`:
```tsx
import ProximityMarkers from "./ProximityMarkers";
```

**Step 2: Destructure `currentParkLocation` from the hook**

In `GeolocationTrackingController` (line ~148–164), add `currentParkLocation` to the destructure:
```tsx
    const {
        accuracy,
        currentParkLocation,
        debugPermission,
        enterDistance,
        exitDistance,
        onGeolocationChange,
        parkDistance,
        parkName,
        prefetchParkName,
        prefetchParks,
        position,
        userOrientationEnabled,
    } = useGeolocationTracking({
        debug,
        resonanceAudioScene,
        stopSound,
    });
```

**Step 3: Render `ProximityMarkers` after `ProximityRingLayer`**

In the JSX return of `GeolocationTrackingController`, after the `<ProximityRingLayer ... />` element, add:

```tsx
<ProximityMarkers
    parkCoords={currentParkLocation ?? [0, 0]}
    parkDistance={parkDistance}
    active={Boolean(parkName) && parkDistance >= 2}
/>
```

The `active` prop ensures:
- `Boolean(parkName)` — user is inside the park boundary (< 15m)
- `parkDistance >= 2` — AmbientGradient has not yet taken over

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/components/GeolocationMap.tsx
git commit -m "feat: render ProximityMarkers halo when user inside park boundary"
```

---

### Task 4: Remove `LeavesCanvas` from `HoaRenderer.tsx`

**Files:**
- Modify: `src/components/HoaRenderer.tsx`

`LeavesCanvas` was the previous "you're near a park" visual; the new map-layer breathing halo supersedes it.

**Step 1: Remove import**

Remove line 8:
```tsx
import LeavesCanvas from './LeavesCanvas';
```

**Step 2: Remove render line**

Remove line 232:
```tsx
{!compact && isPlaying && !rotationActive && <LeavesCanvas parkDistance={parkDistance} />}
```

**Step 3: Verify TypeScript compiles and no unused-import lint errors**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/HoaRenderer.tsx
git commit -m "chore: remove LeavesCanvas from HoaRenderer (superseded by ProximityMarkers)"
```

---

### Task 5: Manual smoke test

Since this involves canvas drawing in response to GPS position, automated tests aren't practical. Use the debug mode to verify visually.

**Steps:**
1. `npm run dev`
2. Navigate to the app with `?debug=true` (or however debug mode is activated — check `GeolocationMap.tsx` props)
3. Verify: when `parkDistance` drops below 15 in the debug panel, the halo appears around the park center marker
4. Verify: halo pulse speed increases as `parkDistance` decreases toward 2
5. Verify: at `parkDistance < 2`, the halo stops (active becomes false) and AmbientGradient takes over
6. Verify: `LeavesCanvas` is no longer rendered in the park modal/strip

**Step 6: Push**

```bash
git push
```
