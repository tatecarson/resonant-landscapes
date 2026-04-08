declare module 'resonance-audio' {
    interface ResonanceSource {
        input: AudioNode;
    }

    class ResonanceAudio {
        output: AudioNode;
        constructor(context: AudioContext);
        setAmbisonicOrder(order: number): void;
        setListenerPosition(x: number, y: number, z: number): void;
        setListenerOrientation(
            forwardX: number, forwardY: number, forwardZ: number,
            upX: number, upY: number, upZ: number
        ): void;
        createSource(): ResonanceSource;
        dispose(): void;
    }

    export { ResonanceAudio };
}
