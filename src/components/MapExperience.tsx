import GeolocationMap from "./GeolocationMap";
import AudioContextProvider from "../contexts/AudioContextProvider";

export default function MapExperience({ debug = false }: { debug?: boolean }) {
  return (
    <AudioContextProvider>
      <GeolocationMap debug={debug} />
    </AudioContextProvider>
  );
}
