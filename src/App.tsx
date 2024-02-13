import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import HOARenderer from "./components/HoaRenderer";
import GimbalTest from "./components/GimbalTest";
import OpenLayers from "./components/OpenLayers";
import GeoLocatedScene from "./components/GeoLocatedScene";

// import './App.css'

function App() {

  const refLatitude = 44.01234956954271; // Replace with your reference latitude
  const refLongitude = -97.11308012225948; // Replace with your reference longitude

  const home = [43.99572, -97.11831]

  return (
    <AudioContextProvider>
      {/* <GimbalTest />
      <HOARenderer /> */}
      {/* <ARScene /> */}

      {/* <GeoLocatedScene refLatitude={home[0]} refLongitude={home[1]} /> */}
      <OpenLayers />
    </AudioContextProvider>
  );
}

export default App;
