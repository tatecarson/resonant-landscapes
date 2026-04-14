import { distanceInMeters } from "./geo";

export const PREFETCH_DISTANCE = 40; // meters — park enters approach-ring animation range

/**
 * Returns the nearest park within maxDistance of userLocation,
 * or null if no parks qualify. Ignores array order.
 *
 * @param {[number, number]} userLocation - [longitude, latitude]
 * @param {{ name: string; scaledCoords: [number, number] }[]} parks
 * @param {number} maxDistance - meters
 */
/**
 * Returns the closest park to userLocation and its distance, regardless of range.
 * Returns null if parks is empty.
 *
 * @param {[number, number]} userLocation - [longitude, latitude]
 * @param {{ name: string; scaledCoords: [number, number] }[]} parks
 * @returns {{ park: object, distance: number } | null}
 */
export function findClosestPark(userLocation, parks) {
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const park of parks) {
    const distance = distanceInMeters(userLocation, park.scaledCoords);
    if (distance < closestDistance) {
      closest = park;
      closestDistance = distance;
    }
  }

  return closest ? { park: closest, distance: closestDistance } : null;
}

/**
 * Returns all parks within maxDistance of userLocation, each with its distance.
 * Used for the visual proximity ring — does not affect audio prefetch logic.
 *
 * @param {[number, number]} userLocation - [longitude, latitude]
 * @param {{ name: string; scaledCoords: [number, number] }[]} parks
 * @param {number} maxDistance - meters
 * @returns {{ coords: [number, number], distance: number }[]}
 */
export function findParksInRange(userLocation, parks, maxDistance) {
  const result = [];

  for (const park of parks) {
    const distance = distanceInMeters(userLocation, park.scaledCoords);
    if (distance < maxDistance) {
      result.push({ coords: park.scaledCoords, distance });
    }
  }

  return result;
}

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
