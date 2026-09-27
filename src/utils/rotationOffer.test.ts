import { describe, expect, it } from "vitest";
import { canOfferRotation, rotationStaysOn } from "./rotationOffer";

describe("canOfferRotation", () => {
    it("offers rotation once the walker has reached the centre and the park is playing", () => {
        expect(canOfferRotation({ isPlaying: true, reachedCenter: true })).toBe(true);
    });

    it("does not offer it before the walker reaches the centre", () => {
        expect(canOfferRotation({ isPlaying: true, reachedCenter: false })).toBe(false);
    });

    it("does not offer it while nothing is playing", () => {
        expect(canOfferRotation({ isPlaying: false, reachedCenter: true })).toBe(false);
    });
});

describe("rotationStaysOn", () => {
    it("keeps rotation on while the walker is still at the spot they reached", () => {
        expect(rotationStaysOn({ reachedCenter: true })).toBe(true);
    });

    it("turns it off once they have left the park", () => {
        expect(rotationStaysOn({ reachedCenter: false })).toBe(false);
    });
});
