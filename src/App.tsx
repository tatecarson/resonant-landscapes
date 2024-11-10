import React, { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import { MapContainer } from "./components/map/MapContainer";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeDialog from "./components/dialogs/WelcomeDialog";
import GeolocationCheck from './contexts/GeolocationCheck';
// import './App.css'

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <ErrorBoundary fallback={<div>Error</div>}>
      <AudioContextProvider>
        <GeolocationCheck>
          <WelcomeDialog isOpen={isOpen} setIsOpen={setIsOpen} />
          {!isOpen && <MapContainer />}
        </GeolocationCheck>
      </AudioContextProvider>
    </ErrorBoundary>
  );
};

export default App;
