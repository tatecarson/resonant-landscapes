import { describe, expect, it } from "vitest";
import { declarePlaybackAudioSession } from "./audioSession";

describe("declarePlaybackAudioSession", () => {
    it("declares deliberate media playback when the API exists", () => {
        const session = { type: "auto" };

        const declared = declarePlaybackAudioSession({
            audioSession: session,
        } as unknown as Navigator);

        expect(declared).toBe(true);
        expect(session.type).toBe("playback");
    });

    it("leaves browsers without the API alone", () => {
        expect(declarePlaybackAudioSession({} as Navigator)).toBe(false);
    });

    it("does not turn an experimental setter failure into an unlock failure", () => {
        const nav = {
            audioSession: {
                get type() {
                    return "auto";
                },
                set type(_next: string) {
                    throw new Error("disabled");
                },
            },
        } as unknown as Navigator;

        expect(declarePlaybackAudioSession(nav)).toBe(false);
    });
});
