import React, { Suspense, lazy, startTransition, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeModal from "./components/WelcomeModal";
// import './App.css'

const MapExperience = lazy(() => import("./components/MapExperience"));

function App() {
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const preloadMap = window.setTimeout(() => {
      void import("./components/MapExperience");
    }, 1200);

    return () => {
      window.clearTimeout(preloadMap);
    };
  }, [isOpen]);

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

    // TODO: add welcome screen 
    <ErrorBoundary fallback={<div>Error</div>}>
      <WelcomeModal isOpen={isOpen} setIsOpen={setWelcomeOpen} />
      {!isOpen && (
        <Suspense fallback={<div>Loading map...</div>}>
          <MapExperience />
        </Suspense>
      )}
    </ErrorBoundary>

  );
}

export default App;
