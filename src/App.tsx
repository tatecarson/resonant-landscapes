import React, { Suspense, lazy, startTransition, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeModal from "./components/WelcomeModal";
// import './App.css'

const MapExperience = lazy(() => import("./components/MapExperience"));

function isDebugLocation(location: Location) {
  return location.pathname.endsWith("/debug") || location.hash === "#/debug";
}

function DebugRoute() {
  return (
    <Suspense fallback={<div>Loading debug tools...</div>}>
      <MapExperience debug />
    </Suspense>
  );
}

function App() {
  const [isOpen, setIsOpen] = useState(true)
  const [isDebugRoute, setIsDebugRoute] = useState(() => isDebugLocation(window.location));

  useEffect(() => {
    const syncDebugRoute = () => {
      setIsDebugRoute(isDebugLocation(window.location));
    };

    window.addEventListener("hashchange", syncDebugRoute);
    window.addEventListener("popstate", syncDebugRoute);

    return () => {
      window.removeEventListener("hashchange", syncDebugRoute);
      window.removeEventListener("popstate", syncDebugRoute);
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
      {isDebugRoute ? (
        <DebugRoute />
      ) : (
        <>
          <WelcomeModal isOpen={isOpen} setIsOpen={setWelcomeOpen} />
          {!isOpen && (
            <Suspense fallback={<div>Loading map...</div>}>
              <MapExperience />
            </Suspense>
          )}
        </>
      )}
    </ErrorBoundary>
  );
}

export default App;
