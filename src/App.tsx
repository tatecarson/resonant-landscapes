'use client';
import AudioContextProvider from "./contexts/AudioContextProvider";
import OpenLayers from "./components/OpenLayers";
import { ErrorBoundary } from "react-error-boundary";

// import './App.css'

function App() {

  return (

    <ErrorBoundary fallback={<div>Error</div>}>
      <AudioContextProvider>
        <OpenLayers />
      </AudioContextProvider>
    </ErrorBoundary>

  );
}

export default App;
