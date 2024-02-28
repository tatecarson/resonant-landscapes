import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import GyroscopePermissionProvider from "./contexts/GyroscopePermissionProvider";
import OpenLayers from "./components/OpenLayers";
import HoaRenderer from "./components/HoaRenderer";
import GimbalArrow from "./components/GimbalArrow";

// import './App.css'

function App() {

  return (

    <AudioContextProvider>
      <OpenLayers />
    </AudioContextProvider>

  );
}

export default App;
