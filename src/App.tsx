import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import HOARenderer from "./components/HoaRenderer";
import GimbalTest from "./components/GimbalTest";

import GeoLocatedScene from "./components/GeoLocatedScene";


function App() {

  const refLatitude = 44.01234956954271; // Replace with your reference latitude
  const refLongitude = -97.11308012225948; // Replace with your reference longitude

  return (
    <AudioContextProvider>
      {/* <GimbalTest />
      <HOARenderer /> */}
      {/* <ARScene /> */}

      <GeoLocatedScene refLatitude={refLatitude} refLongitude={refLongitude} />
    </AudioContextProvider>
  );
}

export default App;
