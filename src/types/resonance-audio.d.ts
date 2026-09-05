declare module 'resonance-audio' {
    interface ResonanceSource {
        input: AudioNode;
    }

    class ResonanceAudio {
        output: AudioNode;
        ambisonicInput: AudioNode;
        ambisonicOutput: AudioNode;
        constructor(context: BaseAudioContext, options?: { ambisonicOrder?: number });
        setAmbisonicOrder(order: number): void;
        setListenerFromMatrix(matrix: { elements: number[] }): void;
        setListenerPosition(x: number, y: number, z: number): void;
        setListenerOrientation(
            forwardX: number, forwardY: number, forwardZ: number,
            upX: number, upY: number, upZ: number
        ): void;
        createSource(options?: { rolloff?: "none" | "logarithmic" | "linear" }): ResonanceSource;
        dispose(): void;
    }

    export { ResonanceAudio };
}
