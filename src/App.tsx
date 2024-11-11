import React, { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import OpenLayers from "./components/OpenLayers";
import { ErrorBoundary } from "react-error-boundary";
import WelcomeModal from "./components/modals/WelcomeModal";
// import './App.css'

function App() {
  const [isOpen, setIsOpen] = useState(true)

  return (

    // TODO: add welcome screen 
    <ErrorBoundary fallback={<div>Error</div>}>
      <AudioContextProvider>
        <WelcomeModal isOpen={isOpen} setIsOpen={setIsOpen} />
        {!isOpen && <OpenLayers />}
      </AudioContextProvider>
    </ErrorBoundary>

  );
}

export default App;
