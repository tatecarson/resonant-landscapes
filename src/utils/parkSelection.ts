import { distanceInMeters, type Coordinate } from "./geo";

export type Park = {
  name: string;
  scaledCoords: Coordinate;
};

export type ParkWithDistance = {
  park: Park;
  distance: number;
};

export type ParkInRange = {
  coords: Coordinate;
  distance: number;
};

/**
 * Returns the closest park to userLocation and its distance, regardless of range.
 * Returns null if parks is empty.
 */
export function findClosestPark<T extends Park>(
  userLocation: Coordinate,
  parks: T[]
): { park: T; distance: number } | null {
  let closest: T | null = null;
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
 */
export function findParksInRange(
  userLocation: Coordinate,
  parks: Park[],
  maxDistance: number
): ParkInRange[] {
  const result: ParkInRange[] = [];

  for (const park of parks) {
    const distance = distanceInMeters(userLocation, park.scaledCoords);
    if (distance < maxDistance) {
      result.push({ coords: park.scaledCoords, distance });
    }
  }

  return result;
}

export function selectNearestInRangePark<T extends Park>(
  userLocation: Coordinate,
  parks: T[],
  maxDistance: number
): T | null {
  let nearest: T | null = null;
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
 */
export function scanParks<T extends Park>(
  userLocation: Coordinate,
  parks: T[],
  { prefetchDistance, enterDistance }: { prefetchDistance: number; enterDistance: number }
): {
  closest: { park: T; distance: number } | null;
  inPrefetchRange: ParkInRange[];
  nearestInEnterRange: T | null;
} {
  let closest: T | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  let nearestInEnterRange: T | null = null;
  let nearestInEnterRangeDistance = Number.POSITIVE_INFINITY;
  const inPrefetchRange: ParkInRange[] = [];

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
