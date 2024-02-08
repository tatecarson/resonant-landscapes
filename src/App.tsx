import { useState } from "react";
import AudioContextProvider from "./contexts/AudioContextProvider";
import HOARenderer from "./components/HoaRenderer";
import GimbalTest from "./components/GimbalTest";

function App() {
  return (
    <AudioContextProvider>
      <GimbalTest />
      <HOARenderer />
    </AudioContextProvider>
  );
}

export default App;
