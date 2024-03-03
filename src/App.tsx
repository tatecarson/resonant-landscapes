'use client';

import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import OpenLayers from "./components/OpenLayers";
import { ErrorBoundary } from "react-error-boundary";

// import './App.css'

function App() {

  return (

    <AudioContextProvider>
      <ErrorBoundary fallback={<div>Error</div>}>
        <OpenLayers />
      </ErrorBoundary>
    </AudioContextProvider>

  );
}

export default App;
