import { expect, it } from "vitest";
import { getMonoFallbackUrl } from "./audioPaths";

it("selects the same independent W mix for both spatial delivery families", () => {
    for (const suffix of ["sounds/Newton-Hills-1-001_8ch.m4a", "sounds-flac/Newton-Hills-1-001_8ch.flac"]) {
        expect(getMonoFallbackUrl(`https://resonant-landscapes.b-cdn.net/${suffix}`))
            .toBe("https://resonant-landscapes.b-cdn.net/sounds-mono-w/Newton-Hills-1-001_w.flac");
    }
    expect(getMonoFallbackUrl("https://example.com/file_8ch.flac")).toBeNull();
    expect(getMonoFallbackUrl("https://resonant-landscapes.b-cdn.net/sounds/Newton-Hills-1-001_mono.m4a")).toBeNull();
});
