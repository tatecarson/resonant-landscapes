import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import GyroscopePermissionProvider from "./contexts/GyroscopePermissionProvider";
import OpenLayers from "./components/OpenLayers";

// import './App.css'

function App() {

  return (
    <AudioContextProvider>
      <GyroscopePermissionProvider>
        <OpenLayers />
      </GyroscopePermissionProvider>
    </AudioContextProvider>
  );
}

export default App;
