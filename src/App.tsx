import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import GyroscopePermissionProvider from "./contexts/GyroscopePermissionProvider";
import OpenLayers from "./components/OpenLayers";
import HoaRenderer from "./components/HoaRenderer";

// import './App.css'

function App() {

  return (
    <AudioContextProvider>
      {/* <HoaRenderer /> */}
      {/* <GyroscopePermissionProvider> */}
      {/* FIXME: this is making everything rerender, what's the correct way to do this? */}
      <OpenLayers />
      {/* </GyroscopePermissionProvider> */}
    </AudioContextProvider>
  );
}

export default App;
