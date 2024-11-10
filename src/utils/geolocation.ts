// src/utils/geolocation.ts
export function mod(n: number): number {
    return ((n % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}