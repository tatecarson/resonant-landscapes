import GeolocationMap from "./GeolocationMap";
import type { Variant, MockPosition } from "../App";

export default function MapExperience({
  debug = false,
  variant = "dsu",
  mockPosition = null,
}: {
  debug?: boolean;
  variant?: Variant;
  mockPosition?: MockPosition | null;
}) {
  return (
    <GeolocationMap debug={debug} variant={variant} mockPosition={mockPosition} />
  );
}
