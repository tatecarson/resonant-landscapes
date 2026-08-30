import React, { Suspense, lazy, startTransition, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeModal from "./components/WelcomeModal";
import { isDebugEnabled } from "./config/debug";
import AudioContextProvider from "./contexts/AudioContextProvider";
// import './App.css'

const MapExperience = lazy(() => import("./components/MapExperience"));

export type Variant = "dsu" | "terrace";

/**
 * The debug route and the ?mock= position spoof are development affordances,
 * and both shipped in the production bundle — so anyone could reach the debug
 * tools, or place themselves inside a park without walking to it. A walk that
 * can be faked from a sofa is not the piece.
 *
 * Still reachable in a production build with ?debug, which is what lets the
 * mobile suites drive a deploy preview.
 */
function isDebugLocation(location: Location) {
  if (!isDebugEnabled()) {
    return false;
  }
  // startsWith rather than an exact match: the hash carries its own query
  // string, so #/debug?debug — the natural way to ask for the debug route on a
  // production build — used to fall through to the ordinary app in silence.
  return location.pathname.endsWith("/debug") || location.hash.startsWith("#/debug");
}

function detectVariant(location: Location): Variant {
  const hashRoute = location.hash.replace(/^#/, "").split("?")[0];
  if (hashRoute === "/terrace" || location.pathname.endsWith("/terrace")) {
    return "terrace";
  }
  return "dsu";
}

export type MockPosition = [number, number]; // [lon, lat]

function detectMockPosition(location: Location): MockPosition | null {
  if (!isDebugEnabled()) {
    return null;
  }
  // Dev shim: parse `?mock=lat,lon` from either the search string or the
  // post-? portion of the hash (e.g. `#/terrace?mock=43.5548,-96.7419`).
  const hashQuery = location.hash.includes("?") ? location.hash.split("?")[1] : "";
  const params = new URLSearchParams(hashQuery || location.search.replace(/^\?/, ""));
  const raw = params.get("mock");
  if (!raw) return null;
  const [latStr, lonStr] = raw.split(",");
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lon, lat];
}

function DebugRoute({ variant, mockPosition }: { variant: Variant; mockPosition: MockPosition | null }) {
  return (
    <Suspense fallback={<div>Loading debug tools...</div>}>
      <MapExperience debug variant={variant} mockPosition={mockPosition} />
    </Suspense>
  );
}

function App() {
  const [isOpen, setIsOpen] = useState(true)
  const [isDebugRoute, setIsDebugRoute] = useState(() => isDebugLocation(window.location));
  const [variant, setVariant] = useState<Variant>(() => detectVariant(window.location));
  const [mockPosition, setMockPosition] = useState<MockPosition | null>(() => detectMockPosition(window.location));

  useEffect(() => {
    const syncRoute = () => {
      setIsDebugRoute(isDebugLocation(window.location));
      setVariant(detectVariant(window.location));
      setMockPosition(detectMockPosition(window.location));
    };

    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);

    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);

  useEffect(() => {
    if (isDebugRoute) {
      return;
    }

    if (!isOpen) {
      return;
    }

    const preloadMap = window.setTimeout(() => {
      void import("./components/MapExperience");
    }, 1200);

    return () => {
      window.clearTimeout(preloadMap);
    };
  }, [isOpen, isDebugRoute]);

  function setWelcomeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setIsOpen(true);
      return;
    }

    startTransition(() => {
      setIsOpen(false);
    });
  }

  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <AudioContextProvider>
        {isDebugRoute ? (
          <DebugRoute variant={variant} mockPosition={mockPosition} />
        ) : (
          <>
            <WelcomeModal isOpen={isOpen} setIsOpen={setWelcomeOpen} variant={variant} />
            {!isOpen && (
              <Suspense fallback={<div>Loading map...</div>}>
                <MapExperience variant={variant} mockPosition={mockPosition} />
              </Suspense>
            )}
          </>
        )}
      </AudioContextProvider>
    </ErrorBoundary>
  );
}

export default App;
