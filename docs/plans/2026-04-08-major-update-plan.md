# Resonant Landscapes — Major Update Plan

## Overview

Two-track update: **stability first**, then **visual redesign**. The app is functional but has rough edges — janky map movement, potential audio bugs, unnecessary re-renders, and console noise. Once the foundation is solid, we redesign the full UI: clean/minimal modals, polished map overlays, and an artistic watercolor map tile style.

---

## Track 1: Stability & Performance

### Epic: Smooth Map & Location Tracking

The user-location dot and map panning feel janky while walking. Goal: make movement feel continuous and smooth.

**Issues:**

#### 1.1 Smooth location dot movement
- Investigate how `RGeolocation` / `OLGeoLoc` position updates are applied to the map view
- Add position smoothing — either interpolate between GPS fixes or use OpenLayers' built-in view animation on position change
- Ensure the map only re-centers when the user has moved a meaningful distance (dead-zone threshold)
- Test with Playwright path replay to verify smooth movement

#### 1.2 Smooth map pan/zoom transitions
- Audit `RMap` view update calls in [OpenLayers.tsx](src/components/OpenLayers.tsx)
- Add `duration` to any `view.animate()` or `view.setCenter()` calls so transitions are animated rather than instant
- Check whether heading changes cause jerky map rotation; smooth those too if applicable

---

### Epic: Audio Pipeline Correctness

Audio works but may have edge cases (context not resuming, buffers not loading, source nodes leaking).

**Issues:**

#### 1.3 Audit AudioContextProvider for correctness
- Review [AudioContextProvider.tsx](src/contexts/AudioContextProvider.tsx) end-to-end
- Verify `AudioContext` is properly resumed after user gesture (iOS requires this)
- Check that `stopSound` fully disconnects the source node before a new one is created — look for source node leaks when a park modal is opened/closed repeatedly
- Confirm `cleanupBuffers` actually runs on unmount and that the context is closed
- The `buffers` state is typed as an array but used as a single `AudioBuffer` — verify this is intentional and document it clearly

#### 1.4 Fix audio loading race conditions in HoaRenderer
- Review [HoaRenderer.tsx](src/components/HoaRenderer.tsx)
- The `useEffect` for loading fires on `parkName` change — ensure an in-flight load is cancelled/ignored if `parkName` changes before it completes (stale load)
- Verify `soundPath()` never returns a broken URL for any park in `stateParks.json`
- Add a visible error state to the UI when `loadError` is set (currently may be silent to the user)

---

### Epic: Render Optimization

**Issues:**

#### 1.5 Profile and reduce unnecessary re-renders
- Use React DevTools Profiler on the main map experience to identify components re-rendering too often
- Audit prop passing in [OpenLayers.tsx](src/components/OpenLayers.tsx) — memoize callbacks with `useCallback` and stable values with `useMemo` where missing
- `ParkModal` is already wrapped in `memo` — verify its props are stable (no inline objects/functions that defeat memo)
- Check `AudioContextProvider` — does any state change cause all consumers to re-render unnecessarily? Consider splitting context if needed.

---

### Epic: TypeScript Correctness

Running `tsc --noEmit` currently produces errors across 6 files. None are suppressed — they're real gaps in type safety.

**Issues:**

#### 1.6 Fix TypeScript errors across the codebase

Errors by file:

- **[GimbalArrow.tsx](src/components/GimbalArrow.tsx)** — `DeviceOrientationEvent.requestPermission` is iOS-only and not in the standard TS lib; needs a type augmentation or cast. Implicit `any` on event handler. `animationFrameId` untyped. `setListenerOrientation` missing on `never`-typed resonance scene.
- **[HelpModal.tsx](src/components/HelpModal.tsx)** — Props destructured without types; add a `Props` interface.
- **[HoaRenderer.tsx](src/components/HoaRenderer.tsx)** — Implicit `any` on `parksJSON`, `park`, and all props. `bufferSourceRef` possibly null in three places — add null guards.
- **[LeavesCanvas.tsx](src/components/LeavesCanvas.tsx)** — `Leaf` class is missing all property declarations (x1, y1, ctx, speed, etc.). `canvas` ref possibly null. `animationFrameId` typed incorrectly as `number` passed where `void` expected. Largest error surface in the project.
- **[OpenLayers.tsx](src/components/OpenLayers.tsx)** — `setListenerPosition` on `never`-typed resonance scene. Coordinate arrays typed as `any[]` instead of `[number, number]`. `audioContext.state` on `never`.
- **[AudioContextProvider.tsx](src/contexts/AudioContextProvider.tsx)** — Context value types likely need tightening; `resonanceAudioScene` typed as `null` in initial context but used as a real object downstream (source of the `never` errors in consumers).

Fix strategy: start with `AudioContextProvider` context types (fixes the `never` cascade in `GimbalArrow` and `OpenLayers`), then work file by file.

---

### Epic: Console Noise

**Issues:**

#### 1.7 Investigate and fix console warnings and errors
- After TS errors are fixed, run the app in dev mode and collect all remaining console output during a normal session (welcome modal → park approach → play audio → stop → walk away)
- Categorize: React warnings (missing keys, missing deps arrays), OpenLayers warnings, audio errors, TypeScript-missed runtime issues
- Fix each category — do not suppress warnings without understanding them
- Pay attention to any `webkitAudioContext` deprecation warnings or Omnitone warnings about channel counts

---

## Track 1.5: UX Improvements

*These are new interaction features, not bug fixes. Implement after Track 1 stability work, before or alongside Track 2 redesign.*

### Epic: Proximity Approach Indicator

Replace the falling leaves animation with a screen-edge glow that intensifies as the user approaches a park.

#### 1.8 Replace LeavesCanvas with screen-edge proximity glow
- Remove or disable [LeavesCanvas.tsx](src/components/LeavesCanvas.tsx) from the park approach UI
- Implement a new `ProximityGlow` component: a fixed full-screen overlay with a radial/edge gradient that fades in as the user enters the park's proximity radius and intensifies toward the center
- Glow color should feel warm and natural — soft amber, warm white, or a color derived from the watercolor tile palette
- Animate smoothly using CSS transitions keyed to `parkDistance` — no abrupt jumps
- Should be visible on top of the map but not obscure map content or UI controls (use a low-opacity overlay with `pointer-events: none`)
- Use the `/frontend-design` skill when implementing

---

### Epic: Body-Orientation Rotation Feedback

When the user is at the center of a park and rotating their phone for 360° spatial audio, replace the checkbox with a fullscreen ambient visual that responds to compass direction in real time.

#### 1.9 Fullscreen orientation ambient indicator + modal collapse
- **This issue must be implemented together with issue 2.4 (ParkModal redesign)** — they are one unified experience
- Remove the current checkbox/toggle UI for enabling gyroscope rotation in [HoaRenderer.tsx](src/components/HoaRenderer.tsx)
- Replace with a clear, touchable "Enable Rotation" button in the park modal
- Once rotation is active, two things happen simultaneously:
  1. **Modal collapses** to a minimal bottom strip showing only park name + stop button — `ParkModal` already has a `compact` prop that can be extended or repurposed for this state
  2. **Ambient layer appears** full-screen: a soft directional gradient/vignette that rotates with the user's compass heading (e.g. cool tones north, warm tones south, neutral east/west)
- The collapsed modal strip should sit at the bottom of the screen above the ambient layer — visually connected, not floating awkwardly
- Ambient layer animates smoothly with CSS transitions on heading change — no jitter
- When rotation is deactivated (user taps stop or walks away), ambient layer fades out and modal expands back to full size
- Heading data flows through `userOrientation` prop — wire ambient component to that
- Use the `/frontend-design` skill when implementing

---

## Track 2: Visual Redesign

*Begin after Track 1 issues are resolved and verified.*

### Epic: Map Tiles — Watercolor Style

#### 2.1 Switch to Stadia Stamen Watercolor tiles
- Register for a free Stadia Maps API key (required since 2023)
- Replace the `ROSM` tile source in [OpenLayers.tsx](src/components/OpenLayers.tsx) with a Stadia Stamen Watercolor tile layer using OpenLayers' `XYZ` source
- Tile URL pattern: `https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg?api_key=YOUR_KEY`
- Verify park marker dots (the location circles) remain clearly visible against the watercolor background — adjust marker colors/stroke if needed
- Test at the zoom level used when walking the campus path

---

### Epic: Modal Redesign — Clean/Minimal

Target: white backgrounds, generous whitespace, modern sans-serif typography, subtle shadows. No heavy Tailwind gray utility noise.

> **Note:** Use the `/frontend-design` skill when implementing all redesign issues in this track.

#### 2.2 Redesign WelcomeModal
- Replace the current boilerplate Headless UI dialog styling in [WelcomeModal.tsx](src/components/WelcomeModal.tsx)
- Clean layout: app name as large, light-weight heading; body text with comfortable line-height; single clear CTA button
- Button: solid dark (near-black) fill, white text, rounded — not the current outlined gray style
- Keep the `Transition` animations; they're already good

#### 2.3 Redesign HelpModal
- Same design system as WelcomeModal ([HelpModal.tsx](src/components/HelpModal.tsx))
- Structure the troubleshooting tips as a short, scannable list rather than paragraphs
- Style the contact email link to match the new palette

#### 2.4 Redesign ParkModal
- **Implement together with issue 1.9 (rotation ambient indicator)** — the modal collapse-to-strip behavior is part of this redesign
- Redesign the full modal in [ParkModal.tsx](src/components/ParkModal.tsx): park name as prominent heading, distance as small secondary label, play/stop controls as large touch-friendly buttons
- Add a rotation-active collapsed state: a minimal bottom strip (park name + stop button only) that the modal transitions into when the user enables rotation
- The existing `compact` prop may be reused or replaced by an explicit `rotationActive` state — evaluate during implementation
- Ensure play/stop icons from HeroIcons are sized for mobile tap targets (min 44×44px)
- Use the `/frontend-design` skill when implementing

---

### Epic: Map Overlay UI Cleanup

#### 2.5 Clean up on-map UI elements
- Audit all fixed-position overlays rendered in [OpenLayers.tsx](src/components/OpenLayers.tsx)
- Debug panel: already well-designed — ensure it blends with the new watercolor background (adjust `bg-white/92` opacity if needed)
- Help button / any map controls: restyle to match the clean/minimal system
- Location dot marker: consider upgrading from the current PNG (`geolocation_marker_heading.png`) to an SVG with a clean, minimal style that reads well over watercolor tiles
- Park marker icons (`trees.png`): evaluate whether these read well over the new tile style; may need a redesign or replacement

---

## Out of Scope (for now)

- Adding new parks or recordings
- Changes to the spatial audio algorithm or HOA rendering logic
- Expanding to Android / non-Safari browsers
- New features (e.g. recording history, user accounts)

---

## Definition of Done

**Track 1:** No console errors during a normal session. Map and dot movement is smooth. Audio loads, plays, and stops reliably. No source node leaks on repeated open/close.

**Track 2:** App uses Stadia Watercolor tiles. All three modals use the new clean/minimal design system. On-map UI elements are consistent with the new look. Tested on mobile via Playwright iPhone profile and on real iOS Safari.
