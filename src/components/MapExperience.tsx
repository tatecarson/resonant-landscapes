import OpenLayers from "./OpenLayers";
import AudioContextProvider from "../contexts/AudioContextProvider";

export default function MapExperience({ debug = false }: { debug?: boolean }) {
  return (
    <AudioContextProvider>
      <OpenLayers debug={debug} />
    </AudioContextProvider>
  );
}
