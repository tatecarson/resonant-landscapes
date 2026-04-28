# Terrace Park (Sioux Falls) variant — geometric design notes

This is a record of how the SD state parks are mapped onto walkable Terrace Park ground, what trade-offs were considered, and which knobs to turn if the layout needs to change. The implementation lives in [`src/utils/scaledParks.js`](../src/utils/scaledParks.js).

## Goal

Run the experience at Terrace Park in Sioux Falls (centered ~`43.5548, -96.7419`) instead of DSU's campus, **preserving the South Dakota state parks' relative spatial relationships** so people walking the variant still get the SD-shape — Sica Hollow stays roughly NE of Custer, Newton Hills south of Palisades, etc. — just shrunk down to a couple-hundred metres.

The pattern follows [resonant-landscapes-milan/src/js/scaledParks.js](https://github.com/tatecarson/resonant-landscapes-milan/blob/main/src/js/scaledParks.js): linear-remap the SD bounding box into a target rectangle, then push pins out of forbidden polygons.

## The geometric problem

The 13 SD state parks span roughly:

- **Longitude**: −103.7° to −96.5° → ~7° wide (Custer + Bear Butte are far west in the Black Hills; the other 11 are clustered in the SE/NE)
- **Latitude**: 43.2° to 45.7° → ~2.5° tall

So SD's bounding box is **wide-and-short** (aspect ratio ~2.8 : 1).

Terrace Park's walkable land is roughly:

- **Longitude**: −96.7460 to −96.7418 → ~340 m wide
- **Latitude**: 43.5540 to 43.5585 → ~500 m tall

So Terrace's walkable footprint is **narrow-and-tall** (aspect ratio ~0.7 : 1, or 1 : 1.5 inverted).

A naïve linear remap would compress SD east-west and stretch it north-south by an extreme factor, squishing the SD shape so badly that two parks at the same SD latitude end up far apart in Terrace.

## Decision: rotate SD 90° before remapping

Rotating the SD shape 90° aligns SD's **long axis (E-W)** with Terrace's **long axis (N-S)** before the linear remap. After rotation:

- SD's east-west range (7°) maps to Terrace's north-south range (~500 m).
- SD's north-south range (2.5°) maps to Terrace's east-west range (~340 m).

Both axes scale by similar factors (~2 m per 1° SD ≈ orders of magnitude apart but **proportional**), so the SD shape arrives in Terrace looking less squished — closer to a true similarity transform.

### Direction of rotation

The current code uses `ROTATE_DIRECTION = 'cw'`:

```js
// CW: (lon, lat) → (lat, -lon)
function rotateSD([lon, lat]) {
    return ROTATE_DIRECTION === 'cw' ? [lat, -lon] : [-lat, lon];
}
```

Empirically this puts:

- **Custer & Bear Butte** (SD's far west, at lon ≈ −103.5) → **Terrace north** (around the aquatic center / north end of Covell Lake)
- **The other 11 parks** (SD's NE/SE cluster, lon ≈ −96 to −98) → **Terrace south** (between Covell Lake's south end and W 4th St, spanning both banks)

If walking it onsite makes the orientation feel wrong (e.g., you'd rather have the "tail" of two parks at the south of Terrace), flip a single line:

```js
const ROTATE_DIRECTION = 'ccw'; // was 'cw'
```

That swaps Custer/Bear Butte to the south end. No other changes needed.

## Linear bbox remap

After rotation, every park has a transformed `(x, y)` pair (where `x` came from original lat, `y` came from −original lon). Then:

```js
const { minX, maxX, minY, maxY } = findBoundingBoxXY(rotated);
const xScale = (TERRACE_E - TERRACE_W) / (maxX - minX);
const yScale = (TERRACE_N - TERRACE_S) / (maxY - minY);

scaledLon = TERRACE_W + (rx - minX) * xScale;
scaledLat = TERRACE_S + (ry - minY) * yScale;
```

This is exactly the Milan formula, with a small inward `TERRACE_BUFFER` on each edge to avoid pins exactly on the bounding-box border.

## Bounding box for Terrace Park

```js
const TERRACE_BOUNDS = {
    west:  -96.7460,  // ~N Lake Ave (west edge of park, west of Covell Lake)
    east:  -96.7418,  // ~just west of N Grange Ave (east edge of park)
    north:  43.5585,  // ~just south of W Madison St (north edge)
    south:  43.5540,  // ~just north of W 4th St (keeps south cluster on park green)
};
```

These were tuned by visual iteration in the preview pane (using the `?mock=lat,lon` dev shim — see [`useGeolocationTracking.ts`](../src/hooks/useGeolocationTracking.ts)). The footprint deliberately spans **both banks** of Covell Lake so the SD shape can use the whole park; the lake itself is dodged via the no-go-polygon snap-out described below.

## No-go polygons (`terraceNoGoPolygons.json`)

After remap, some pins inevitably land in places people can't walk:

- **Covell Lake** — bisects Terrace Park north-south.
- **Buildings** — Lions Den, the bath house, an unnamed structure near the pool, and a row of apartments at the SE corner.
- **Swimming pools** — three at the aquatic center.
- **N Grange Ave** — eastern street boundary.

These are stored as a GeoJSON `FeatureCollection` in [`src/data/terraceNoGoPolygons.json`](../src/data/terraceNoGoPolygons.json). Most polygons came from a one-off OSM Overpass API query:

```
[out:json][timeout:25];
(
  way["natural"="water"]["name"~"Covell"](43.550,-96.748,43.562,-96.738);
  relation["natural"="water"]["name"~"Covell"](43.550,-96.748,43.562,-96.738);
  way["leisure"="swimming_pool"](43.555,-96.7440,43.560,-96.7415);
  way["building"](43.555,-96.7440,43.560,-96.7415);
);
(._;>;);
out;
```

The Covell Lake outline came back as two `multipolygon` relations with inner-ring holes; both are committed verbatim. The N Grange Ave strip is hand-drawn because OSM streets are LineStrings, not Polygons (and a thin rectangle covers it well enough for our purposes).

### Snap-out algorithm

If a remapped point lands inside any feature in the FeatureCollection, `snapOutOfNoGo` walks it outward in an expanding **square spiral** (E, N, W, S, with leg length growing by one on every other turn), stepping ~9 m at a time, capped at 240 iterations:

```js
const stepDeg = 0.00008;          // ~9 m at this latitude
const dirs = [[1,0], [0,1], [-1,0], [0,-1]];
// expanding-square-spiral until isPointInNoGo is false
```

If the cap is hit, the function logs a warning and returns the last position — a buggy polygon will degrade gracefully instead of freezing the page.

This matches Milan's `movePointOutsideBuildings` in spirit but rebuilt as a true outward spiral rather than a fixed circle, so a pin landing deep in Covell Lake's middle escapes regardless of starting direction.

## Tuning checklist

1. **Map center feels off** → adjust `TERRACE_BOUNDS`. Each side is one number; the linear remap takes care of the rest.
2. **A specific park lands in a place you can't actually walk** → add a polygon to `terraceNoGoPolygons.json` covering that spot. The snap-out handles it next render.
3. **N/S orientation feels backwards** → flip `ROTATE_DIRECTION`.
4. **Whole layout feels rotated wrong** → it's possible to skip rotation entirely (set `rotateSD` to identity); the SD shape will then arrive with strong east-west compression but no rotation. Probably worse.
5. **A pin escapes the snap-out cap** → check the console for the warning, fix the polygon (most likely a self-intersecting ring from OSM).

## Verification flow

```bash
# Dev server
npm run dev

# Open in a regular browser tab (preview iframes block geolocation)
open 'http://localhost:5173/#/terrace?mock=43.5560,-96.7425'
```

The `?mock=lat,lon` shim feeds a synthetic position into the geolocation hook so the map renders without real GPS — see [`src/hooks/useGeolocationTracking.ts`](../src/hooks/useGeolocationTracking.ts).

Programmatic check that no pin lands in a no-go polygon (run in the browser console):

```js
const [{getScaledPoints}, ng, turf] = await Promise.all([
  import('/src/utils/scaledParks.js'),
  import('/src/data/terraceNoGoPolygons.json'),
  import('/node_modules/.vite/deps/@turf_turf.js'),
]);
getScaledPoints('terrace').filter(p => {
  const pt = turf.point(p.scaledCoords);
  return ng.features.some(f => turf.booleanPointInPolygon(pt, f));
});
// expected: []
```
