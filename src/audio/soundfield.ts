import type { ResonanceAudio } from "resonance-audio";

export const AMBISONIC_ORDER = 2;
export const SOUNDFIELD_CHANNELS = (AMBISONIC_ORDER + 1) ** 2;

/** Construct the decoder at the required order. setAmbisonicOrder only changes
 * future source encoders in resonance-audio 1.0; it does not rebuild the listener. */
export async function createSoundfieldScene(context: AudioContext): Promise<ResonanceAudio> {
    const { ResonanceAudio } = await import("resonance-audio");
    return new ResonanceAudio(context, { ambisonicOrder: AMBISONIC_ORDER });
}

/** Resonance Audio's default logarithmic rolloff, using actual metres. Recorded
 * soundfields bypass its point-source attenuation, so apply the scalar here. */
export function gainAtDistance(distance: number): number {
    if (!Number.isFinite(distance)) return 0;
    if (distance <= 1) return 1;
    if (distance >= 1000) return 0;
    return (1 / distance - 1 / 1000) / (1 - 1 / 1000);
}

type Scene = Pick<ResonanceAudio, "ambisonicInput" | "createSource">;

export function createSoundfieldInput(context: BaseAudioContext, scene: Scene) {
    const field = context.createGain();
    field.channelCount = SOUNDFIELD_CHANNELS;
    field.channelCountMode = "explicit";
    field.channelInterpretation = "discrete";
    scene.ambisonicInput.channelCount = SOUNDFIELD_CHANNELS;
    scene.ambisonicInput.channelCountMode = "explicit";
    scene.ambisonicInput.channelInterpretation = "discrete";
    field.connect(scene.ambisonicInput);

    // Reuse one point source for genuine mono fallback instead of accumulating
    // a Source in scene._sources on every park entry. Distance is applied here.
    let mono: GainNode | null = null;
    let targetGain = 1;
    return {
        inputForChannels(channels: number): GainNode {
            if (channels === SOUNDFIELD_CHANNELS) return field;
            if (channels !== 1) throw new Error(`Unsupported playback channel count: ${channels}`);
            if (!mono) {
                mono = context.createGain();
                mono.channelCount = 1;
                mono.channelCountMode = "explicit";
                mono.channelInterpretation = "discrete";
                mono.gain.value = targetGain;
                const source = scene.createSource({ rolloff: "none" });
                source.input.channelCount = 1;
                source.input.channelCountMode = "explicit";
                source.input.channelInterpretation = "discrete";
                mono.connect(source.input);
            }
            return mono;
        },
        setDistance(metres: number) {
            targetGain = gainAtDistance(metres);
            // Smooth GPS updates independently of each playback's entrance/exit fade.
            for (const node of [field, mono]) {
                node?.gain.setTargetAtTime(targetGain, context.currentTime, 0.05);
            }
        },
    };
}

/** Convert a physical listener pose (Web Audio: right +X, up +Y, front -Z)
 * to the world-to-listener rotation of the ACN first-order basis [Y,Z,X].
 * The SDK's setListenerOrientation forwards an unconverted Cartesian matrix
 * to its HOA rotator, including a reflection at the default -Z forward pose.
 * Its matrix setter lets us supply the proper rotation explicitly. */
export function listenerRotationMatrix(forward: readonly number[], up: readonly number[]): number[] {
    const [fx, fy, fz] = forward;
    const [ux, uy, uz] = up;
    const rx = fy * uz - fz * uy;
    const ry = fz * ux - fx * uz;
    const rz = fx * uy - fy * ux;
    return [rx, -ux, -fx, 0, -ry, uy, fy, 0, rz, -uz, -fz, 0, 0, 0, 0, 1];
}

export function setSoundfieldOrientation(
    scene: Pick<ResonanceAudio, "setListenerFromMatrix">,
    forward: readonly number[], up: readonly number[]
) {
    scene.setListenerFromMatrix({ elements: listenerRotationMatrix(forward, up) });
}

/** Gimbal exposes columns of the inverse sensor rotation with +Z forward.
 * Transpose that basis to recover the physical listener pose used above. */
export function setSoundfieldGimbalOrientation(
    scene: Pick<ResonanceAudio, "setListenerFromMatrix">,
    f: { x: number; y: number; z: number },
    u: { x: number; y: number; z: number }
) {
    const rightY = u.z * f.x - u.x * f.z;
    const rightZ = u.x * f.y - u.y * f.x;
    setSoundfieldOrientation(scene, [-rightZ, -u.z, -f.z], [rightY, u.y, f.y]);
}
