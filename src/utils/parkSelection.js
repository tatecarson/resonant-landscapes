import { distanceInMeters } from "./geo";

export const PREFETCH_DISTANCE = 40; // meters — park enters approach-ring animation range

/**
 * @typedef {{ name: string; scaledCoords: [number, number] }} Park
 */

/**
 * Returns the closest park to userLocation and its distance, regardless of range.
 * Returns null if parks is empty.
 *
 * @param {[number, number]} userLocation - [longitude, latitude]
 * @param {Park[]} parks
 * @returns {{ park: Park, distance: number } | null}
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
 * @param {Park[]} parks
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

/**
 * One pass over the parks answering everything a geolocation tick needs.
 *
 * findClosestPark, findParksInRange and selectNearestInRangePark were each
 * called per tick and each walked all 13 parks — three scans and 39 haversine
 * calls for three answers that come from the same distances. They remain
 * exported and tested individually; this is the hot path.
 *
 * @param {[number, number]} userLocation - [longitude, latitude]
 * @param {Park[]} parks
 * @param {{ prefetchDistance: number, enterDistance: number }} distances
 * @returns {{
 *   closest: { park: Park, distance: number } | null,
 *   inPrefetchRange: { coords: [number, number], distance: number }[],
 *   nearestInEnterRange: Park | null,
 * }}
 */
export function scanParks(userLocation, parks, { prefetchDistance, enterDistance }) {
  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  let nearestInEnterRange = null;
  let nearestInEnterRangeDistance = Number.POSITIVE_INFINITY;
  const inPrefetchRange = [];

  for (const park of parks) {
    const distance = distanceInMeters(userLocation, park.scaledCoords);

    if (distance < closestDistance) {
      closest = park;
      closestDistance = distance;
    }

    if (distance < prefetchDistance) {
      inPrefetchRange.push({ coords: park.scaledCoords, distance });
    }

    if (distance < enterDistance && distance < nearestInEnterRangeDistance) {
      nearestInEnterRange = park;
      nearestInEnterRangeDistance = distance;
    }
  }

  return {
    closest: closest ? { park: closest, distance: closestDistance } : null,
    inPrefetchRange,
    nearestInEnterRange,
  };
}
