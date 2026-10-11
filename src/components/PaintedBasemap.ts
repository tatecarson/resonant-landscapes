import type RenderEvent from "ol/render/Event";
import { palette } from "../theme/palette";

/**
 * Paints the basemap in the browser (rl-ffdd).
 *
 * A Kuwahara filter: for each pixel, average the four overlapping quarter
 * discs that meet at it and keep the one whose colour varies least. Quarter
 * discs rather than the textbook squares, because squares leave hard
 * rectangular blocks that read as pixelation once the result is enlarged. Flat areas smooth into
 * patches, edges stay where they are because no square straddles them, and
 * foliage in aerial imagery turns into something close to brush dabs. A slow
 * displacement of where it samples gives the edges a hand-drawn wobble, and a
 * fine grain stops the patches reading as flat digital fill.
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
 * Worked at reduced resolution on purpose: the map redraws on every heading
 * change, a full Kuwahara pass at a phone's 3x density is the expensive part,
 * and the enlargement back up only softens what is meant to look soft.
 */

/** Sampling radius in output pixels; each pixel reads (2R+1)^2 texels. */
export const KUWAHARA_RADIUS = 4;
/** Output pixels per CSS pixel. Below 1 is cheaper and broader-brushed. */
export const PAINT_RESOLUTION = 0.5;

/**
 * The lightness ramp, dark to light, as palette tokens: no colour here is
 * chosen, only which tokens and where on the ramp they sit.
 */
export const TONE_RAMP = [
    { token: "edge", at: 0 },
    { token: "accentSoft", at: 0.3 },
    { token: "panel", at: 0.6 },
    { token: "surface", at: 0.82 },
    { token: "ground", at: 1 },
] as const satisfies readonly { token: keyof typeof palette; at: number }[];
/**
 * Where the darkest patch lands on the ramp. Above zero so nothing on the
 * ground reaches the edge and accentSoft the park markers are drawn in.
 */
export const TONE_FLOOR = 0.5;
/**
 * The source lightness that reaches the top of the ramp. Below 1 so that only
 * the brightest roofs and roads reach cream; most of the ground stays in the
 * mints, and the highlights stop jumping out of it.
 */
export const TONE_CEILING = 0.8;
/** How much of the photograph's own colour survives the remap. */
export const ORIGINAL_COLOUR = 0.15;

function tokenRgb(token: keyof typeof palette): [number, number, number] {
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

// WebGL 1 for iOS 15: loop bounds have to be constants.
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
/** One output pixel, in texture coordinates. */
uniform vec2 u_step;
varying vec2 v_uv;

#define R ${KUWAHARA_RADIUS}

uniform vec3 u_tone0;
uniform vec3 u_tone1;
uniform vec3 u_tone2;
uniform vec3 u_tone3;
uniform vec3 u_tone4;

vec3 tone(float t) {
    if (t < ${glslFloat(TONE_RAMP[1].at)}) return mix(u_tone0, u_tone1, t / ${glslFloat(TONE_RAMP[1].at)});
    if (t < ${glslFloat(TONE_RAMP[2].at)}) return mix(u_tone1, u_tone2, (t - ${glslFloat(TONE_RAMP[1].at)}) / ${glslFloat(TONE_RAMP[2].at - TONE_RAMP[1].at)});
    if (t < ${glslFloat(TONE_RAMP[3].at)}) return mix(u_tone2, u_tone3, (t - ${glslFloat(TONE_RAMP[2].at)}) / ${glslFloat(TONE_RAMP[3].at - TONE_RAMP[2].at)});
    return mix(u_tone3, u_tone4, (t - ${glslFloat(TONE_RAMP[3].at)}) / ${glslFloat(TONE_RAMP[4].at - TONE_RAMP[3].at)});
}

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

void main() {
    vec2 p = gl_FragCoord.xy;
    vec2 wobble = vec2(noise(p * 0.035), noise(p * 0.035 + 19.3)) - 0.5;
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
    vec3 v0 = abs(s0 / n - m0.rgb * m0.rgb);
    vec3 v1 = abs(s1 / n - m1.rgb * m1.rgb);
    vec3 v2 = abs(s2 / n - m2.rgb * m2.rgb);
    vec3 v3 = abs(s3 / n - m3.rgb * m3.rgb);
    float d0 = v0.r + v0.g + v0.b;
    float d1 = v1.r + v1.g + v1.b;
    float d2 = v2.r + v2.g + v2.b;
    float d3 = v3.r + v3.g + v3.b;

    vec4 colour = m0;
    float least = d0;
    if (d1 < least) { least = d1; colour = m1; }
    if (d2 < least) { least = d2; colour = m2; }
    if (d3 < least) { colour = m3; }

    if (colour.a <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    // Premultiplied in and out: the remap works on the straight colour.
    vec3 straight = colour.rgb / colour.a;
    float lightness = dot(straight, vec3(0.299, 0.587, 0.114));
    // Aerial imagery sits in a narrow band of lightness; stretch it to the
    // whole ramp before lifting the floor.
    float t = mix(${glslFloat(TONE_FLOOR)}, 1.0, smoothstep(0.06, ${glslFloat(TONE_CEILING)}, lightness));
    vec3 painted = mix(tone(t), straight, ${glslFloat(ORIGINAL_COLOUR)});

    float grain = 1.0 + (hash(p) - 0.5) * 0.04;
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
    private readonly stepLocation: WebGLUniformLocation | null;
    private lost = false;

    constructor() {
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
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
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
        this.stepLocation = gl.getUniformLocation(program, "u_step");
        TONE_RAMP.forEach(({ token }, index) => {
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

    /** Paints `source` at `width` x `height` and returns the canvas holding it. */
    render(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
        const { gl } = this;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // Throws a SecurityError if any tile on the canvas was not CORS-clean.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform2f(this.stepLocation, 1 / width, 1 / height);
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
export function createPaintedBasemapListener(): {
    listener: (event: RenderEvent) => void;
    dispose: () => void;
} | null {
    let pass: KuwaharaPass;
    try {
        pass = new KuwaharaPass();
    } catch (error) {
        console.warn("[painted basemap] unavailable, showing plain imagery", error);
        return null;
    }

    let failed = false;
    const listener = (event: RenderEvent) => {
        const context = event.context;
        if (failed || !pass.usable || !(context instanceof CanvasRenderingContext2D)) {
            return;
        }
        const source = context.canvas;
        const pixelRatio = event.frameState?.pixelRatio ?? window.devicePixelRatio ?? 1;
        const scale = PAINT_RESOLUTION / pixelRatio;
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));

        let painted: HTMLCanvasElement;
        try {
            painted = pass.render(source, width, height);
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
