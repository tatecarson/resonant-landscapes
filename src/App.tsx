import React, { Suspense, lazy, startTransition, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeModal from "./components/WelcomeModal";
import AudioContextProvider from "./contexts/AudioContextProvider";
// import './App.css'

const MapExperience = lazy(() => import("./components/MapExperience"));

export type Variant = "dsu" | "terrace";

function isDebugLocation(location: Location) {
  return location.pathname.endsWith("/debug") || location.hash === "#/debug";
}

function detectVariant(location: Location): Variant {
  if (location.hash === "#/terrace" || location.pathname.endsWith("/terrace")) {
    return "terrace";
  }
  return "dsu";
}

function DebugRoute({ variant }: { variant: Variant }) {
  return (
    <Suspense fallback={<div>Loading debug tools...</div>}>
      <MapExperience debug variant={variant} />
    </Suspense>
  );
}

function App() {
  const [isOpen, setIsOpen] = useState(true)
  const [isDebugRoute, setIsDebugRoute] = useState(() => isDebugLocation(window.location));
  const [variant, setVariant] = useState<Variant>(() => detectVariant(window.location));

  useEffect(() => {
    const syncRoute = () => {
      setIsDebugRoute(isDebugLocation(window.location));
      setVariant(detectVariant(window.location));
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
          <DebugRoute variant={variant} />
        ) : (
          <>
            <WelcomeModal isOpen={isOpen} setIsOpen={setWelcomeOpen} variant={variant} />
            {!isOpen && (
              <Suspense fallback={<div>Loading map...</div>}>
                <MapExperience variant={variant} />
              </Suspense>
            )}
          </>
        )}
      </AudioContextProvider>
    </ErrorBoundary>
  );
}

export default App;
