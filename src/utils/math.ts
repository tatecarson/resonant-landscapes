export function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    // A degenerate input range would divide by zero and return NaN, which then
    // propagates silently into canvas alpha and animation speeds — an
    // invisible layer rather than an error. Clamp to the low end instead.
    if (inMin === inMax) {
        return outMin;
    }

    const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
    return outMin + t * (outMax - outMin);
}
