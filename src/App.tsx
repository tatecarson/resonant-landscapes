import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import "./App.css";
import AmbisonicAudio from "./components/AmbisonicsAudio";
import DraggableArrow from "./components/DraggableArrow";
import HOARenderer from "./components/HoaRenderer";
// import ResonanceAudioComponent from "./components/ResonanceAudioComponent";

function App() {
  return (
    <AudioContextProvider>
      <div className="app">
        <header className="app-header">
          <h1>Ambisonic Audio Player</h1>

        </header>
        <main>
          <HOARenderer />
          {/* <ResonanceAudioComponent /> */}

          {/* <AmbisonicAudio /> */}
        </main>
      </div>
    </AudioContextProvider>
  );
}

export default App;
