import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import GyroscopePermissionProvider from "./contexts/GyroscopePermissionProvider";
import OpenLayers from "./components/OpenLayers";

// import './App.css'

function App() {

  return (
    <GyroscopePermissionProvider>
      <AudioContextProvider>
        {/* FIXME: this is making everything rerender, what's the correct way to do this? */}
        <OpenLayers />
      </AudioContextProvider>
    </GyroscopePermissionProvider>
  );
}

export default App;
