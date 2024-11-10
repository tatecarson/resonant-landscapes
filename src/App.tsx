import React, { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import { OpenLayers } from "./components/map/OpenLayers";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeModal from "./components/WelcomeModal";
import GeolocationCheck from './components/GeolocationCheck';
// import './App.css'

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <AudioContextProvider>
        <GeolocationCheck>
          <WelcomeModal isOpen={isOpen} setIsOpen={setIsOpen} />
          {!isOpen && <OpenLayers />}
        </GeolocationCheck>
      </AudioContextProvider>
    </ErrorBoundary>
  );
};

export default App;
