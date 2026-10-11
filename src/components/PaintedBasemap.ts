import type RenderEvent from "ol/render/Event";
import { palette } from "../theme/palette";

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
 * brush step before upload, so sampling it does not alias; the output is one
 * pixel per CSS pixel; the discs are blended by how flat each is rather than
 * one picked; and the wobble and grain are computed from map coordinates, so
 * they are painted on the ground and travel with it.
 *
 * Then the colour is taken away from the photograph and given to the palette:
 * each patch's lightness is looked up on a ramp of palette tokens, so the
 * ground is the app's own greens and cream rather than a satellite's, and only
 * a little of the original hue is mixed back so roofs, roads and water still
 * part from the grass. The ramp starts partway up, which keeps the darkest
 * canopy lighter than the park markers drawn over it. Which ramp is
 * PAINTED_TONES below.
 *
 * It runs on the tile layer's own canvas after the tiles are drawn and before
 * anything else is, so the rings, glow and marker above it stay crisp. The
 * canvas already carries the layer's opacity, so the arrival dissolve fades the
 * painted ground the same as the plain one.
 *
 * Not at the phone's full density: the map redraws on every heading change,
 * and a pass at 3x would be nine times the work for detail the painting is
 * there to remove.
 */

/** Sampling radius in brush steps; each pixel reads the texels of a disc this wide. */
export const KUWAHARA_RADIUS = 4;
/** CSS pixels between samples. Sets the brush size with the radius: 8 px. */
export const BRUSH_STEP = 2;
/** Output pixels per CSS pixel. */
export const PAINT_RESOLUTION = 0.75;
/**
 * How sharply the flattest disc wins. Higher approaches the textbook filter,
 * which picks one and snaps; lower blurs across edges.
 */
export const DISC_SHARPNESS = 4;

type Token = keyof typeof palette;
type ToneStop = { token: Token; at: number };

export interface PaintedTone {
    /**
     * The lightness ramp, dark to light, as palette tokens: no colour here is
     * chosen, only which tokens and where on the ramp they sit.
     */
    ramp: readonly ToneStop[];
    /**
     * Where the darkest patch lands on the ramp. Above zero so nothing on the
     * ground reaches the dark greens the park markers are drawn in.
     */
    floor: number;
    /** How much of the photograph's own colour survives the remap. */
    original: number;
}

/**
 * Grounds to compare under the panels (rl-ffdd), chosen with `?tone=`.
 *
 * `mint` runs through `panel`, so most of the ground is the same mint as the
 * park strip, the modals and the arrival field, and walking in changes the
 * detail on screen but not its colour. `sage` leaves `panel` out, but
 * `surface` is still a pale green and came out close to mint. `paper` is
 * mostly cream: grey-green canopy, then sage into a long run of `ground`, with
 * none of the photograph's own colour, so arriving reads as the screen turning
 * from cream to mint.
 */
export const PAINTED_TONES = {
    mint: {
        ramp: [
            { token: "edge", at: 0 },
            { token: "accentSoft", at: 0.3 },
            { token: "panel", at: 0.6 },
            { token: "surface", at: 0.82 },
            { token: "ground", at: 1 },
        ],
        floor: 0.5,
        original: 0.15,
    },
    sage: {
        ramp: [
            { token: "edge", at: 0 },
            { token: "inkMuted", at: 0.3 },
            { token: "surface", at: 0.75 },
            { token: "ground", at: 1 },
        ],
        floor: 0.55,
        original: 0.15,
    },
    paper: {
        ramp: [
            { token: "edge", at: 0 },
            { token: "inkMuted", at: 0.3 },
            { token: "surface", at: 0.6 },
            { token: "ground", at: 0.8 },
            { token: "ground", at: 1 },
        ],
        floor: 0.4,
        original: 0,
    },
} as const satisfies Record<string, PaintedTone>;

export type PaintedToneName = keyof typeof PAINTED_TONES;
/**
 * Mint, chosen by eye on the Pavilion plaza (rl-ffdd). Sage measured no
 * better against the panels where they actually appear, because inside a park
 * the arrival field washes the screen in panel either way.
 */
export const DEFAULT_PAINTED_TONE: PaintedToneName = "mint";

export function isPaintedToneName(value: unknown): value is PaintedToneName {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(PAINTED_TONES, value);
}

/**
 * The source lightness that reaches the top of the ramp. Below 1 so that only
 * the brightest roofs and roads reach cream, and the highlights stop jumping
 * out of the rest of the ground.
 */
export const TONE_CEILING = 0.8;

function tokenRgb(token: Token): [number, number, number] {
    const value = palette[token].replace("#", "");
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function glslFloat(value: number): string {
    return Number.isInteger(value) ? `${value}.0` : String(value);
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** The ramp as GLSL: one uniform per stop, and a lookup with the stops baked in. */
function toneFunction(ramp: readonly ToneStop[]): string {
    const uniforms = ramp.map((_, index) => `uniform vec3 u_tone${index};`).join("\n");
    const segments = ramp.slice(1).map(({ at }, index) => {
        const from = ramp[index].at;
        const mix = `mix(u_tone${index}, u_tone${index + 1}, (t - ${glslFloat(from)}) / ${glslFloat(at - from)})`;
        return index === ramp.length - 2 ? `    return ${mix};` : `    if (t < ${glslFloat(at)}) return ${mix};`;
    });
    return `${uniforms}\n\nvec3 tone(float t) {\n${segments.join("\n")}\n}`;
}

// WebGL 1 for iOS 15: loop bounds have to be constants.
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
varying vec2 v_uv;

#define R ${KUWAHARA_RADIUS}

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
    return 1.0 / (1.0 + pow(spread * 40.0, ${glslFloat(DISC_SHARPNESS)}));
}

void main() {
    // Where this pixel is on the ground, so the texture belongs to the map.
    vec2 css = vec2(gl_FragCoord.x, u_outHeight - gl_FragCoord.y) * u_outToCss;
    vec2 ground = vec2(
        u_cssToMap.x * css.x + u_cssToMap.z * css.y,
        u_cssToMap.y * css.x + u_cssToMap.w * css.y
    ) + u_mapOffset;

    vec2 wobble = vec2(noise(ground * 0.3), noise(ground * 0.3 + 19.3)) - 0.5;
    vec2 uv = v_uv + wobble * u_step * 2.5;

    vec4 m0 = vec4(0.0); vec4 m1 = vec4(0.0); vec4 m2 = vec4(0.0); vec4 m3 = vec4(0.0);
    vec3 s0 = vec3(0.0); vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0); vec3 s3 = vec3(0.0);
    // Every quarter disc holds the same number of samples, by symmetry.
    float n = 0.0;

    for (int j = -R; j <= R; j++) {
        for (int i = -R; i <= R; i++) {
            if (i * i + j * j > R * R + R) continue;
            if (i <= 0 && j <= 0) n += 1.0;
            vec4 c = texture2D(u_image, uv + vec2(float(i), float(j)) * u_step);
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
    float t = mix(${glslFloat(tone.floor)}, 1.0, smoothstep(0.06, ${glslFloat(TONE_CEILING)}, lightness));
    vec3 painted = mix(tone(t), straight, ${glslFloat(tone.original)});

    float grain = 1.0 + (noise(ground * 1.0) - 0.5) * 0.04;
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

class KuwaharaPass {
    readonly canvas = document.createElement("canvas");
    private readonly gl: WebGLRenderingContext;
    private readonly program: WebGLProgram;
    private readonly texture: WebGLTexture;
    private readonly uniforms: Record<"step" | "outToCss" | "outHeight" | "cssToMap" | "mapOffset", WebGLUniformLocation | null>;
    /** Halving steps between the map canvas and the texture. */
    private readonly shrinkCanvases: HTMLCanvasElement[] = [];
    private lost = false;

    constructor(tone: PaintedTone) {
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
        this.uniforms = {
            step: gl.getUniformLocation(program, "u_step"),
            outToCss: gl.getUniformLocation(program, "u_outToCss"),
            outHeight: gl.getUniformLocation(program, "u_outHeight"),
            cssToMap: gl.getUniformLocation(program, "u_cssToMap"),
            mapOffset: gl.getUniformLocation(program, "u_mapOffset"),
        };
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
     * Paints `source` into an output of `outWidth` x `outHeight` and returns
     * the canvas holding it. `cssWidth` x `cssHeight` is the map's size in CSS
     * pixels, and `cssToMap` the affine transform from them to map coordinates
     * (OpenLayers' [a, b, c, d, e, f]) with `origin` taken off.
     */
    render(
        source: HTMLCanvasElement,
        frame: {
            outWidth: number;
            outHeight: number;
            cssWidth: number;
            cssHeight: number;
            cssToMap: number[];
            origin: [number, number];
        },
    ): HTMLCanvasElement {
        const { gl, uniforms } = this;
        const { outWidth, outHeight, cssWidth, cssHeight, cssToMap, origin } = frame;
        const texWidth = Math.max(1, Math.round(cssWidth / BRUSH_STEP));
        const texHeight = Math.max(1, Math.round(cssHeight / BRUSH_STEP));
        const texture = this.shrink(source, texWidth, texHeight);

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
        pass = new KuwaharaPass(PAINTED_TONES[toneName]);
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
        const cssWidth = source.width / pixelRatio;
        const cssHeight = source.height / pixelRatio;
        const cssToMap = frameState.pixelToCoordinateTransform;
        // Fixed for the life of the pass, so the ground's texture does not
        // jump; only there to keep the shader's numbers small.
        origin ??= [Math.round(cssToMap[4]), Math.round(cssToMap[5])];

        let painted: HTMLCanvasElement;
        try {
            painted = pass.render(source, {
                outWidth: Math.max(1, Math.round(cssWidth * PAINT_RESOLUTION)),
                outHeight: Math.max(1, Math.round(cssHeight * PAINT_RESOLUTION)),
                cssWidth,
                cssHeight,
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
