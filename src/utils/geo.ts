const EARTH_RADIUS_METERS = 6371008.8;

export type Coordinate = [number, number];

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters(
  [lon1, lat1]: Coordinate,
  [lon2, lat2]: Coordinate
): number {
  const latDelta = toRadians(lat2 - lat1);
  const lonDelta = toRadians(lon2 - lon1);
  const lat1Radians = toRadians(lat1);
  const lat2Radians = toRadians(lat2);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1Radians) *
      Math.cos(lat2Radians) *
      Math.sin(lonDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/**
 * Initial bearing from one point to another, in degrees clockwise from true
 * north.
 *
 * Great-circle rather than a flat-earth arctangent. At the distances this
 * walk covers the two agree to well under a degree, but the parks are read
 * off a compass rose eight points wide, and a helper that is only right for
 * short hops is a trap for whoever reaches for it next.
 */
export function bearingDegrees(
  [lon1, lat1]: Coordinate,
  [lon2, lat2]: Coordinate
): number {
  const lat1Radians = toRadians(lat1);
  const lat2Radians = toRadians(lat2);
  const lonDelta = toRadians(lon2 - lon1);

  const y = Math.sin(lonDelta) * Math.cos(lat2Radians);
  const x =
    Math.cos(lat1Radians) * Math.sin(lat2Radians) -
    Math.sin(lat1Radians) * Math.cos(lat2Radians) * Math.cos(lonDelta);

  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  // atan2 returns -180..180; a compass reads 0..360.
  return (degrees + 360) % 360;
}

/** The eight points of the compass, in the order a bearing walks through them. */
export const COMPASS_POINTS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * A bearing as something a walker can act on without a protractor.
 *
 * Eight points rather than sixteen: this is read while moving, and the
 * difference between "NNE" and "NE" is not one anybody can walk. Each point
 * covers 45 degrees, centred on itself, so north runs from 337.5 through 22.5.
 */
export function compassPoint(bearing: number): CompassPoint {
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index];
}

export function scaleCoordinates(
  [lon, lat]: Coordinate,
  [referenceLon, referenceLat]: Coordinate,
  scaleLong: number,
  scaleLat: number
): Coordinate {
  const scaledLong = (lon - referenceLon) * scaleLong;
  const scaledLat = (lat - referenceLat) * scaleLat;

  return [referenceLon + scaledLong, referenceLat + scaledLat];
}
