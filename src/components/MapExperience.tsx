import GeolocationMap from "./GeolocationMap";
import type { Variant } from "../App";

export default function MapExperience({
  debug = false,
  variant = "dsu",
}: {
  debug?: boolean;
  variant?: Variant;
}) {
  return (
    <GeolocationMap debug={debug} variant={variant} />
  );
}
