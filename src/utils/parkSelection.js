import { distanceInMeters } from "./geo";

/**
 * Returns the nearest park within maxDistance of userLocation,
 * or null if no parks qualify. Ignores array order.
 *
 * @param {[number, number]} userLocation - [longitude, latitude]
 * @param {{ name: string; scaledCoords: [number, number] }[]} parks
 * @param {number} maxDistance - meters
 */
export function selectNearestInRangePark(userLocation, parks, maxDistance) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const park of parks) {
    const distance = distanceInMeters(userLocation, park.scaledCoords);
    if (distance < maxDistance && distance < nearestDistance) {
      nearest = park;
      nearestDistance = distance;
    }
  }

  return nearest;
}
