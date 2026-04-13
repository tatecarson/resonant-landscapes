import GeolocationMap from "./GeolocationMap";

export default function MapExperience({ debug = false }: { debug?: boolean }) {
  return (
    <GeolocationMap debug={debug} />
  );
}
