import OpenLayers from "./OpenLayers";
import AudioContextProvider from "../contexts/AudioContextProvider";

export default function MapExperience() {
  return (
    <AudioContextProvider>
      <OpenLayers />
    </AudioContextProvider>
  );
}
