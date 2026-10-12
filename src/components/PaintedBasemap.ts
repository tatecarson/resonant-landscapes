import type RenderEvent from "ol/render/Event";
import { palette } from "../theme/palette";
import {
    DEFAULT_PAINTED_TONE,
    MAX_RADIUS,
    PAINTED_TONES,
    getPaintTuning,
    type PaintTuning,
    type PaintedTone,
    type PaintedToneName,
    type ToneStop,
} from "../config/paintTuning";

/**
 * Paints the basemap in the browser (rl-ffdd).
 *
 * A Kuwahara filter: for each pixel, average the four overlapping quarter
 * discs that meet at it and favour the ones whose colour varies least. Flat
 * areas smooth into patches, edges stay where they are because the discs on
 * either side of one are each flat, and foliage in aerial imagery turns into
 * something close to brush dabs. A slow displacement of where it samples gives
 * the edges a hand-drawn wobble, and a fine grain stops the patches reading as
 * flat digital fill.
 *
 * Built to hold still while the map moves under a walker. The first version
 * shimmered: it painted at half a CSS pixel and enlarged, so building edges
 * stepped in blocks that crawled as the map slid and turned; it kept only the
 * flattest disc, so a pixel snapped between neighbours from one frame to the
 * next; and its wobble and grain were fixed to the screen, so the ground swam
 * through them. Now the source is shrunk in halving steps to one texel per
 * brush step before upload, so sampling it does not alias; the discs are
 * blended by how flat each is rather than one picked; and the wobble and grain
 * are computed from map coordinates, so they are painted on the ground and
 * travel with it.
 *
 * Then the colour is taken away from the photograph and given to the palette:
 * each patch's lightness is looked up on a ramp of palette tokens, so the
 * ground is the app's own greens and cream rather than a satellite's, and only
 * a little of the original hue is mixed back so roofs, roads and water still
 * part from the grass. The ramp starts partway up, which keeps the darkest
 * canopy lighter than the park markers drawn over it.
 *
 * It runs on the tile layer's own canvas after the tiles are drawn and before
 * anything else is, so the rings, glow and marker above it stay crisp. The
 * canvas already carries the layer's opacity, so the arrival dissolve fades the
 * painted ground the same as the plain one.
 *
 * Every number that sets the look is read from the tuning each frame (see
 * config/paintTuning.ts), so the `?tune` panel moves it live. Only the tone's
 * tokens are built into the shader, because they set how many stops it has.
 */

function tokenRgb(token: ToneStop["token"]): [number, number, number] {
    const value = palette[token].replace("#", "");
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** The ramp as GLSL: a colour per stop, the inner stops' positions as uniforms. */
function toneFunction(ramp: readonly ToneStop[]): string {
    const last = ramp.length - 1;
    const colours = ramp.map((_, index) => `uniform vec3 u_tone${index};`).join("\n");
    const stops = ramp.slice(1, -1).map((_, index) => `uniform float u_at${index + 1};`).join("\n");
    const at = (index: number) => (index === 0 ? "0.0" : index === last ? "1.0" : `u_at${index}`);
    const segments = ramp.slice(1).map((_, index) => {
        const mix = `mix(u_tone${index}, u_tone${index + 1}, clamp((t - ${at(index)}) / max(${at(index + 1)} - ${at(index)}, 0.0001), 0.0, 1.0))`;
        return index === last - 1 ? `    return ${mix};` : `    if (t < ${at(index + 1)}) return ${mix};`;
    });
    return `${colours}\n${stops}\n\nvec3 tone(float t) {\n${segments.join("\n")}\n}`;
}

// WebGL 1 for iOS 15: loop bounds have to be constants, so the loops run to
// MAX_RADIUS and skip what the tuning's radius leaves out.
const fragmentShader = (tone: PaintedTone) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_image;
/** One brush step (one source texel), in texture coordinates. */
uniform vec2 u_step;
/** Output pixel to CSS pixel, and the output's height to flip y. */
uniform vec2 u_outToCss;
uniform float u_outHeight;
/** CSS pixel to map coordinates, less a fixed origin so the numbers stay small. */
uniform vec4 u_cssToMap;
uniform vec2 u_mapOffset;

uniform float u_radius;
uniform float u_sharpness;
uniform float u_wobble;
uniform float u_wobbleScale;
uniform float u_grain;
uniform float u_floor;
uniform float u_ceiling;
uniform float u_original;
varying vec2 v_uv;

#define MAX_R ${MAX_RADIUS}

${toneFunction(tone.ramp)}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float discWeight(vec3 variance) {
    float spread = sqrt(variance.r + variance.g + variance.b);
    return 1.0 / (1.0 + pow(spread * 40.0, u_sharpness));
}

void main() {
    // Where this pixel is on the ground, so the texture belongs to the map.
    vec2 css = vec2(gl_FragCoord.x, u_outHeight - gl_FragCoord.y) * u_outToCss;
    vec2 ground = vec2(
        u_cssToMap.x * css.x + u_cssToMap.z * css.y,
        u_cssToMap.y * css.x + u_cssToMap.w * css.y
    ) + u_mapOffset;

    vec2 wobble = vec2(noise(ground * u_wobbleScale), noise(ground * u_wobbleScale + 19.3)) - 0.5;
    vec2 uv = v_uv + wobble * u_step * u_wobble;

    vec4 m0 = vec4(0.0); vec4 m1 = vec4(0.0); vec4 m2 = vec4(0.0); vec4 m3 = vec4(0.0);
    vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
    // Every quarter disc holds the same number of samples, by symmetry.
    float n = 0.0;
    float reach = u_radius * u_radius + u_radius;

    for (int j = -MAX_R; j <= MAX_R; j++) {
        for (int i = -MAX_R; i <= MAX_R; i++) {
            float fi = float(i);
            float fj = float(j);
            if (fi * fi + fj * fj > reach) continue;
            if (i <= 0 && j <= 0) n += 1.0;
            vec4 c = texture2D(u_image, uv + vec2(fi, fj) * u_step);
            vec3 c2 = c.rgb * c.rgb;
            if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
            if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
            if (i <= 0 && j >= 0) { m2 += c; s2 += c2; }
            if (i >= 0 && j >= 0) { m3 += c; s3 += c2; }
        }
    }

    m0 /= n; m1 /= n; m2 /= n; m3 /= n;
    float w0 = discWeight(abs(s0 / n - m0.rgb * m0.rgb));
    float w1 = discWeight(abs(s1 / n - m1.rgb * m1.rgb));
    float w2 = discWeight(abs(s2 / n - m2.rgb * m2.rgb));
    float w3 = discWeight(abs(s3 / n - m3.rgb * m3.rgb));
    vec4 colour = (m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / max(w0 + w1 + w2 + w3, 1e-6);

    if (colour.a <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    // Premultiplied in and out: the remap works on the straight colour.
    vec3 straight = colour.rgb / colour.a;
    float lightness = dot(straight, vec3(0.299, 0.587, 0.114));
    // Aerial imagery sits in a narrow band of lightness; stretch it to the
    // whole ramp before lifting the floor.
    float t = mix(u_floor, 1.0, smoothstep(0.06, max(u_ceiling, 0.07), lightness));
    vec3 painted = mix(tone(t), straight, u_original);

    float grain = 1.0 + (noise(ground) - 0.5) * u_grain;
    painted = clamp(painted * grain, 0.0, 1.0);
    gl_FragColor = vec4(painted * colour.a, colour.a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("createShader failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`shader compile failed: ${log}`);
    }
    return shader;
}

const UNIFORMS = [
    "step", "outToCss", "outHeight", "cssToMap", "mapOffset",
    "radius", "sharpness", "wobble", "wobbleScale", "grain", "floor", "ceiling", "original",
] as const;
type UniformName = (typeof UNIFORMS)[number];

class KuwaharaPass {
    readonly canvas = document.createElement("canvas");
    private readonly gl: WebGLRenderingContext;
    private readonly program: WebGLProgram;
    private readonly texture: WebGLTexture;
    private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>;
    private readonly stopLocations: (WebGLUniformLocation | null)[];
    /** Halving steps between the map canvas and the texture. */
    private readonly shrinkCanvases: HTMLCanvasElement[] = [];
    private lost = false;

    constructor(private readonly toneName: PaintedToneName) {
        const tone = PAINTED_TONES[toneName];
        const gl = this.canvas.getContext("webgl", {
            premultipliedAlpha: true,
            // Read back with drawImage in the same frame; kept so a browser
            // that composites between the two does not hand back a blank.
            preserveDrawingBuffer: true,
            antialias: false,
            depth: false,
        });
        if (!gl) throw new Error("WebGL unavailable");
        this.gl = gl;

        const program = gl.createProgram();
        if (!program) throw new Error("createProgram failed");
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentShader(tone)));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
        }
        this.program = program;
        gl.useProgram(program);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        if (!texture) throw new Error("createTexture failed");
        this.texture = texture;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Map canvases are not powers of two: no mipmaps, clamped edges.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
        this.uniforms = Object.fromEntries(
            UNIFORMS.map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]),
        ) as Record<UniformName, WebGLUniformLocation | null>;
        this.stopLocations = tone.ramp.slice(1, -1).map((_, index) => gl.getUniformLocation(program, `u_at${index + 1}`));
        tone.ramp.forEach(({ token }, index) => {
            gl.uniform3fv(gl.getUniformLocation(program, `u_tone${index}`), tokenRgb(token));
        });

        this.canvas.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            this.lost = true;
        });
    }

    get usable(): boolean {
        return !this.lost;
    }

    /**
     * The map canvas shrunk to `width` x `height` by halving, never by more
     * than half at once: one big step samples a few source pixels per texel
     * and lets the rest flicker in and out as the map moves.
     */
    private shrink(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
        let current = source;
        let level = 0;
        while (current.width > width || current.height > height) {
            const nextWidth = Math.max(width, Math.ceil(current.width / 2));
            const nextHeight = Math.max(height, Math.ceil(current.height / 2));
            const canvas = (this.shrinkCanvases[level] ??= document.createElement("canvas"));
            if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
                canvas.width = nextWidth;
                canvas.height = nextHeight;
            }
            const context = canvas.getContext("2d");
            if (!context) return current;
            context.globalCompositeOperation = "copy";
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(current, 0, 0, nextWidth, nextHeight);
            current = canvas;
            level += 1;
        }
        return current;
    }

    /**
     * Paints `source` with `tuning` and returns the canvas holding it.
     * `cssWidth` x `cssHeight` is the map's size in CSS pixels, and `cssToMap`
     * the affine transform from them to map coordinates (OpenLayers'
     * [a, b, c, d, e, f]), with `origin` taken off.
     */
    render(
        source: HTMLCanvasElement,
        tuning: PaintTuning,
        frame: { cssWidth: number; cssHeight: number; cssToMap: number[]; origin: [number, number] },
    ): HTMLCanvasElement {
        const { gl, uniforms } = this;
        const { cssWidth, cssHeight, cssToMap, origin } = frame;
        const outWidth = Math.max(1, Math.round(cssWidth * tuning.resolution));
        const outHeight = Math.max(1, Math.round(cssHeight * tuning.resolution));
        const texWidth = Math.max(1, Math.round(cssWidth / tuning.brushStep));
        const texHeight = Math.max(1, Math.round(cssHeight / tuning.brushStep));
        const texture = this.shrink(source, texWidth, texHeight);
        const tone = tuning.tones[this.toneName];

        if (this.canvas.width !== outWidth || this.canvas.height !== outHeight) {
            this.canvas.width = outWidth;
            this.canvas.height = outHeight;
        }
        gl.viewport(0, 0, outWidth, outHeight);
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // Throws a SecurityError if any tile on the canvas was not CORS-clean.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
        gl.uniform2f(uniforms.step, 1 / texture.width, 1 / texture.height);
        gl.uniform2f(uniforms.outToCss, cssWidth / outWidth, cssHeight / outHeight);
        gl.uniform1f(uniforms.outHeight, outHeight);
        const [a, b, c, d, e, f] = cssToMap;
        gl.uniform4f(uniforms.cssToMap, a, b, c, d);
        gl.uniform2f(uniforms.mapOffset, e - origin[0], f - origin[1]);
        gl.uniform1f(uniforms.radius, tuning.radius);
        gl.uniform1f(uniforms.sharpness, tuning.sharpness);
        gl.uniform1f(uniforms.wobble, tuning.wobble);
        gl.uniform1f(uniforms.wobbleScale, tuning.wobbleScale);
        gl.uniform1f(uniforms.grain, tuning.grain);
        gl.uniform1f(uniforms.floor, tone.floor);
        gl.uniform1f(uniforms.ceiling, tuning.ceiling);
        gl.uniform1f(uniforms.original, tone.original);
        this.stopLocations.forEach((location, index) => gl.uniform1f(location, tone.stops[index]));
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return this.canvas;
    }

    dispose() {
        this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
}

/**
 * A postrender listener for a canvas tile layer that repaints it in place.
 * Returns null when this browser cannot run the pass, which leaves the plain
 * imagery showing rather than a blank ground.
 */
export function createPaintedBasemapListener(toneName: PaintedToneName = DEFAULT_PAINTED_TONE): {
    listener: (event: RenderEvent) => void;
    dispose: () => void;
} | null {
    let pass: KuwaharaPass;
    try {
        pass = new KuwaharaPass(toneName);
    } catch (error) {
        console.warn("[painted basemap] unavailable, showing plain imagery", error);
        return null;
    }

    let failed = false;
    let origin: [number, number] | undefined;
    const listener = (event: RenderEvent) => {
        const context = event.context;
        if (failed || !pass.usable || !(context instanceof CanvasRenderingContext2D)) {
            return;
        }
        const frameState = event.frameState;
        if (!frameState) {
            return;
        }
        const source = context.canvas;
        const pixelRatio = frameState.pixelRatio || 1;
        const cssToMap = frameState.pixelToCoordinateTransform;
        // Fixed for the life of the pass, so the ground's texture does not
        // jump; only there to keep the shader's numbers small.
        origin ??= [Math.round(cssToMap[4]), Math.round(cssToMap[5])];

        let painted: HTMLCanvasElement;
        try {
            painted = pass.render(source, getPaintTuning(), {
                cssWidth: source.width / pixelRatio,
                cssHeight: source.height / pixelRatio,
                cssToMap,
                origin,
            });
        } catch (error) {
            failed = true;
            console.warn("[painted basemap] could not read the tiles back, showing plain imagery", error);
            return;
        }

        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = "copy";
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(painted, 0, 0, source.width, source.height);
        context.restore();
    };

    return { listener, dispose: () => pass.dispose() };
}
