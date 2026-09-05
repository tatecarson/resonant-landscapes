import { describe, expect, it, vi } from "vitest";
import { createSoundfieldInput, gainAtDistance, listenerRotationMatrix, setSoundfieldGimbalOrientation } from "./soundfield";

const node = () => ({
    connect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() },
    channelCount: 2, channelCountMode: "max", channelInterpretation: "speakers",
});

describe("recorded soundfield input", () => {
    it("routes all nine components to the field input without creating a mono encoder", () => {
        const target = node();
        const gain = node();
        const scene = { ambisonicInput: target, createSource: vi.fn() };
        const input = createSoundfieldInput(
            { createGain: () => gain } as unknown as BaseAudioContext,
            scene as unknown as Parameters<typeof createSoundfieldInput>[1]);
        expect(input.inputForChannels(9)).toBe(gain);
        expect(gain.connect).toHaveBeenCalledWith(target);
        expect(scene.createSource).not.toHaveBeenCalled();
        expect(gain.channelCount).toBe(9);
        expect(target.channelCount).toBe(9);
        expect(target.channelInterpretation).toBe("discrete");
        expect(() => input.inputForChannels(8)).toThrow(/Unsupported/);
    });

    it("reuses mono fallback and does not apply distance attenuation twice", () => {
        const scene = { ambisonicInput: node(), createSource: vi.fn(() => ({ input: node() })) };
        const input = createSoundfieldInput(
            { createGain: node, currentTime: 3 } as unknown as BaseAudioContext,
            scene as unknown as Parameters<typeof createSoundfieldInput>[1]);
        input.setDistance(10);
        const mono = input.inputForChannels(1);
        expect(input.inputForChannels(1)).toBe(mono);
        expect(scene.createSource).toHaveBeenCalledExactlyOnceWith({ rolloff: "none" });
        expect(mono.gain.value).toBeCloseTo(0.0990991);
        input.setDistance(2);
        expect(mono.gain.setTargetAtTime).toHaveBeenCalledWith(gainAtDistance(2), 3, 0.05);
    });
});

describe("distance gain", () => {
    it("uses physical distance, with unity within one metre and a smooth falloff", () => {
        expect(gainAtDistance(0)).toBe(1);
        expect(gainAtDistance(1)).toBe(1);
        expect(gainAtDistance(2)).toBeCloseTo(0.4994995);
        expect(gainAtDistance(10)).toBeCloseTo(0.0990991);
        expect(gainAtDistance(18)).toBeGreaterThan(0);
        expect(gainAtDistance(1000)).toBe(0);
        expect(gainAtDistance(Infinity)).toBe(0);
        expect(gainAtDistance(NaN)).toBe(0);
    });
});


describe("listener orientation", () => {
    it("leaves the calibrated neutral pose unchanged", () => {
        expect(listenerRotationMatrix([0,0,-1], [0,1,0]).map(v => v || 0))
            .toEqual([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    });

    it("converts Gimbal's inverse basis for neutral, right and upward poses", () => {
        const scene = { setListenerFromMatrix: vi.fn() };
        for (const [f, u, forward, up] of [
            [[0,0,1], [0,1,0], [0,0,-1], [0,1,0]],
            [[1,0,0], [0,1,0], [1,0,0], [0,1,0]],
            [[0,1,0], [0,0,-1], [0,1,0], [0,0,1]],
        ]) {
            setSoundfieldGimbalOrientation(scene,
                { x:f[0], y:f[1], z:f[2] }, { x:u[0], y:u[1], z:u[2] });
            const actual = scene.setListenerFromMatrix.mock.lastCall?.[0].elements as number[];
            listenerRotationMatrix(forward, up).forEach((value, index) =>
                expect(actual[index]).toBeCloseTo(value, 8));
        }
    });
});
