import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
// import "./App.css";
import AmbisonicAudio from "./components/AmbisonicsAudio";
import DraggableArrow from "./components/DraggableArrow";
import HOARenderer from "./components/HoaRenderer";
// import OffAxis from "./components/OffAxis";
import GimbalTest from "./components/GimbalTest";
// import ResonanceAudioComponent from "./components/ResonanceAudioComponent";

function App() {
  return (
    <AudioContextProvider>
      <GimbalTest />
      <HOARenderer />
      {/* <div className="app">
        <header className="app-header">

        </header>
        <main> */}
      {/* <HOARenderer /> */}
      {/* 
        </main>
      </div> */}
    </AudioContextProvider>
  );
}

export default App;
