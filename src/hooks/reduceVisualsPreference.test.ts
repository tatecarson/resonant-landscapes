/**
 * The precedence rule on its own, away from React.
 *
 * The interesting part of rl-bde is not the switch, it is that a stored choice
 * WINS over the system setting rather than being OR'd with it. Someone who
 * runs reduce-motion everywhere but wants the full visuals in this piece has
 * to be able to have them, and an OR quietly makes that impossible while
 * looking correct in every other case.
 */
import { describe, expect, it } from "vitest";

/** Exactly the expression in useReduceVisuals, kept in one place. */
const effective = (stored: boolean | null, system: boolean) => stored ?? system;

describe("reduce-visuals precedence", () => {
    it("follows the phone when the walker has not chosen", () => {
        expect(effective(null, true)).toBe(true);
        expect(effective(null, false)).toBe(false);
    });

    it("lets a walker keep the full visuals despite a system-wide reduce", () => {
        // The case an OR gets wrong. This is the whole reason the issue exists.
        expect(effective(false, true)).toBe(false);
    });

    it("lets a walker calm this piece without changing their phone", () => {
        expect(effective(true, false)).toBe(true);
    });

    it("is never the OR of the two", () => {
        const wouldBeOr = (stored: boolean | null, system: boolean) =>
            Boolean(stored) || system;
        expect(effective(false, true)).not.toBe(wouldBeOr(false, true));
    });
});
