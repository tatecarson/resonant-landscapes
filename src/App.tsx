import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import OpenLayers from "./components/OpenLayers";


// import './App.css'

function App() {

  return (
    <AudioContextProvider>

      <OpenLayers />
    </AudioContextProvider>
  );
}

export default App;
