const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceInMeters([lon1, lat1], [lon2, lat2]) {
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

export function scaleCoordinates(
  [lon, lat],
  [referenceLon, referenceLat],
  scaleLong,
  scaleLat
) {
  const scaledLong = (lon - referenceLon) * scaleLong;
  const scaledLat = (lat - referenceLat) * scaleLat;

  return [referenceLon + scaledLong, referenceLat + scaledLat];
}
