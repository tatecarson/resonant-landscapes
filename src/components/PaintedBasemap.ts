import type RenderEvent from "ol/render/Event";
import { apply, invert, multiply, type Transform } from "ol/transform";
import { palette } from "../theme/palette";
import {
    DEFAULT_PAINTED_TONE,
    MAX_RADIUS,
    PAINTED_TONES,
    getPaintTuning,
    type PaintStyle,
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
const brushShader = (tone: PaintedTone) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_image;
/** One brush step (one source texel), in texture coordinates. */
uniform vec2 u_step;
/** Output pixel to the tile canvas's pixel, and the output's height to flip y. */
uniform vec2 u_outToCanvas;
uniform float u_outHeight;
/** Where the output's first pixel sits on the canvas: on a lattice fixed to the ground. */
uniform vec2 u_outOrigin;
/** The photograph's texture: its corner on the canvas and the canvas span it covers. */
uniform vec2 u_texOrigin;
uniform vec2 u_texSpan;
/**
 * Tile canvas pixel to map coordinates, less a fixed origin so the numbers
 * stay small. The canvas, not the screen: OpenLayers draws a turned map on a
 * north-up canvas and turns the canvas.
 */
uniform vec4 u_canvasToMap;
uniform vec2 u_canvasMapOffset;

uniform float u_radius;
uniform float u_sharpness;
uniform float u_wobble;
uniform float u_wobbleScale;
uniform float u_grain;
uniform float u_floor;
uniform float u_ceiling;
uniform float u_original;

#define MAX_R ${MAX_RADIUS}

${toneFunction(tone.ramp)}

/** A tile canvas pixel as a coordinate in the photograph's texture. */
vec2 texUv(vec2 px) {
    return vec2((px.x - u_texOrigin.x) / u_texSpan.x, 1.0 - (px.y - u_texOrigin.y) / u_texSpan.y);
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

float discWeight(vec3 variance) {
    float spread = sqrt(variance.r + variance.g + variance.b);
    return 1.0 / (1.0 + pow(spread * 40.0, u_sharpness));
}

void main() {
    // Where this pixel is on the ground, so the texture belongs to the map.
    vec2 px = vec2(gl_FragCoord.x, u_outHeight - gl_FragCoord.y) * u_outToCanvas + u_outOrigin;
    vec2 ground = vec2(
        u_canvasToMap.x * px.x + u_canvasToMap.z * px.y,
        u_canvasToMap.y * px.x + u_canvasToMap.w * px.y
    ) + u_canvasMapOffset;

    vec2 wobble = vec2(noise(ground * u_wobbleScale), noise(ground * u_wobbleScale + 19.3)) - 0.5;
    vec2 uv = texUv(px) + wobble * u_step * u_wobble;

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

/**
 * The collage: after David Hockney's photo joiners, read through the cubists.
 *
 * The ground is covered in overlapping rectangular prints, each pinned to a
 * spot on a jittered grid in map coordinates and showing the imagery from a
 * slightly shifted spot, so neighbours meet a little out of register, as
 * prints laid by hand do. A pixel takes the topmost print covering it.
 *
 * The prints face the viewer: their frames are upright on the screen, as
 * photographs laid on a page are, and only their contents turn as the map
 * turns with the walker. Frames that turned with the ground (the first
 * version) made the whole joiner swing like one sheet whenever the phone did,
 * which Tate found killed it. Each print's centre is still on the ground, so
 * the prints travel with the map as the walker moves. `u_turn` tilts a print
 * on the page, and its photograph with it. Inside a fragment the photograph's lightness is cut
 * into a few flat bands on the palette ramp, so its shades become planes, and
 * each fragment is lit as a plane tilted its own way. A cream print edge runs
 * round each one.
 *
 * Where prints sit and what they show is in map coordinates, so they ride
 * with the ground instead of being re-cut every frame.
 */
const collageShader = (tone: PaintedTone) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_image;
/** Output pixel to the tile canvas's pixel, and the output's height to flip y. */
uniform vec2 u_outToCanvas;
uniform float u_outHeight;
/** Where the output's first pixel sits on the canvas: on a lattice fixed to the ground. */
uniform vec2 u_outOrigin;
/** The photograph's texture: its corner on the canvas and the canvas span it covers. */
uniform vec2 u_texOrigin;
uniform vec2 u_texSpan;
uniform vec4 u_canvasToMap;
uniform vec2 u_canvasMapOffset;
/** Map coordinates (less the origin) back to tile canvas pixels, to sample the photo. */
uniform vec4 u_mapToCanvas;
uniform vec2 u_mapToCanvasOffset;
/** A step on the ground to a step on the screen and back, in CSS pixels. */
uniform vec4 u_mapToScreen;
uniform vec4 u_screenToMap;
/** Screen CSS pixels per output pixel. */
uniform float u_screenPerOut;

uniform float u_cell;
uniform float u_turn;
uniform float u_shift;
uniform float u_overlap;
uniform float u_border;
uniform float u_bands;
uniform float u_planes;
uniform vec3 u_printEdge;

uniform float u_floor;
uniform float u_ceiling;
uniform float u_original;

${toneFunction(tone.ramp)}

/** A tile canvas pixel as a coordinate in the photograph's texture. */
vec2 texUv(vec2 px) {
    return vec2((px.x - u_texOrigin.x) / u_texSpan.x, 1.0 - (px.y - u_texOrigin.y) / u_texSpan.y);
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

/** A step on the ground as a step on the screen, in CSS pixels. */
vec2 groundToScreen(vec2 d) {
    return vec2(u_mapToScreen.x * d.x + u_mapToScreen.z * d.y, u_mapToScreen.y * d.x + u_mapToScreen.w * d.y);
}

/** A step on the screen as a step on the ground. */
vec2 screenToGround(vec2 d) {
    return vec2(u_screenToMap.x * d.x + u_screenToMap.z * d.y, u_screenToMap.y * d.x + u_screenToMap.w * d.y);
}

/**
 * One print: its centre on the ground, the pixel's place in its upright frame
 * in screen pixels, its half size, and its height in the stack.
 */
void printAt(vec2 candidate, vec2 ground, float cellPx, out vec2 centre, out vec2 local, out vec2 halfSize, out float z) {
    vec2 r = hash2(candidate);
    vec2 r2 = hash2(candidate + 17.13);
    centre = (candidate + 0.5 + (r - 0.5) * 0.5) * u_cell;
    float a = (r2.x - 0.5) * 2.0 * u_turn;
    // Prints are rarely square and never all one size: vary the aspect and
    // the scale, as a hand-laid joiner does.
    float scale = mix(0.8, 1.3, hash(candidate + 41.7));
    halfSize = cellPx * u_overlap * scale * vec2(0.8 + 0.4 * r2.y, 1.2 - 0.4 * r2.y);
    // In screen pixels, so the frame stands upright on the page whatever the
    // map's heading; a is the print's own tilt.
    vec2 d = groundToScreen(ground - centre);
    float ca = cos(a);
    float sa = sin(a);
    local = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    z = hash(candidate + 3.7);
}

vec4 photoAt(vec2 ground) {
    vec2 px = vec2(
        u_mapToCanvas.x * ground.x + u_mapToCanvas.z * ground.y,
        u_mapToCanvas.y * ground.x + u_mapToCanvas.w * ground.y
    ) + u_mapToCanvasOffset;
    return texture2D(u_image, texUv(px));
}

void main() {
    vec2 px = vec2(gl_FragCoord.x, u_outHeight - gl_FragCoord.y) * u_outToCanvas + u_outOrigin;
    vec2 ground = vec2(
        u_canvasToMap.x * px.x + u_canvasToMap.z * px.y,
        u_canvasToMap.y * px.x + u_canvasToMap.w * px.y
    ) + u_canvasMapOffset;

    vec2 cell = floor(ground / u_cell);
    float cellPx = u_cell * length(vec2(u_mapToScreen.x, u_mapToScreen.y));
    float topmost = -1.0;
    vec2 id = cell;
    vec2 centre = ground;
    vec2 local = vec2(0.0);
    vec2 halfSize = vec2(1.0);

    // Five by five: an upright print over a grid turned by the heading can
    // reach further across the grid than the cells next to its own.
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            vec2 candidate = cell + vec2(float(dx), float(dy));
            vec2 c;
            vec2 l;
            vec2 h;
            float z;
            printAt(candidate, ground, cellPx, c, l, h, z);
            if (abs(l.x) < h.x && abs(l.y) < h.y && z > topmost) {
                topmost = z;
                id = candidate;
                centre = c;
                local = l;
                halfSize = h;
            }
        }
    }

    // The print edges, from every print at or above the one showing, so an
    // edge straddles its print's boundary and is softened on both sides: the
    // switch from one print to the next is hard, and a turned map runs it
    // diagonally across the pixels.
    float soft = 1.0 * u_screenPerOut;
    float printEdge = 0.0;
    if (u_border > 0.0) {
        for (int dy = -2; dy <= 2; dy++) {
            for (int dx = -2; dx <= 2; dx++) {
                vec2 candidate = cell + vec2(float(dx), float(dy));
                vec2 c;
                vec2 l;
                vec2 h;
                float z;
                printAt(candidate, ground, cellPx, c, l, h, z);
                if (z < topmost) continue;
                // Positive inside the print, in screen pixels.
                float e = min(h.x - abs(l.x), h.y - abs(l.y));
                float band = smoothstep(-soft, soft, e) * (1.0 - smoothstep(u_border - soft, u_border + soft, e));
                printEdge = max(printEdge, band);
            }
        }
    }

    vec4 colour;
    if (topmost < 0.0) {
        // A gap between prints: the ground itself shows through.
        colour = photoAt(ground);
    } else {
        // This print's photograph: the ground under it, turned with the
        // print's own tilt and taken from a spot a little off where it lies,
        // so neighbours meet out of register. Ground-true, so it turns with
        // the map inside the upright frame.
        vec2 offset = (hash2(id + 5.3) - 0.5) * u_shift * u_cell * 2.0;
        vec2 taken = centre + screenToGround(local) + offset;
        // A few taps soften the photograph before it is cut into bands, so
        // the bands follow shapes rather than the photo's speckle.
        float s = u_cell * 0.03;
        colour = (photoAt(taken) * 2.0 + photoAt(taken + vec2(s, 0.0)) + photoAt(taken - vec2(s, 0.0))
            + photoAt(taken + vec2(0.0, s)) + photoAt(taken - vec2(0.0, s))) / 6.0;
    }

    if (colour.a <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }
    vec3 straight = colour.rgb / colour.a;
    float lightness = dot(straight, vec3(0.299, 0.587, 0.114));
    float level = smoothstep(0.06, max(u_ceiling, 0.07), lightness);
    if (u_bands > 0.5) {
        // Flat bands with a sliver of blend between them, so a band edge
        // does not crawl a pixel at a time as the map moves.
        float scaled = level * u_bands;
        float band = floor(scaled);
        level = (band + smoothstep(0.45, 0.55, scaled - band)) / u_bands;
    }
    if (topmost >= 0.0) {
        // Each print lit as a plane leaning its own way.
        vec2 lean = normalize(hash2(id + 9.1) - 0.5 + 0.0001);
        level += dot(local / halfSize, lean) * u_planes;
    }
    float t = mix(u_floor, 1.0, clamp(level, 0.0, 1.0));
    vec3 painted = mix(tone(t), straight, u_original);

    painted = mix(painted, u_printEdge, printEdge * 0.9);
    gl_FragColor = vec4(painted * colour.a, colour.a);
}
`;

/**
 * How much of each new frame shows while the map moves; the rest is the
 * frames before it, lined up with the ground.
 *
 * Tate likes a high edge sharpness, and a high sharpness flickers: each pixel
 * all but picks one quarter disc, and the imagery under it is resampled a
 * little differently every frame as the canvas is redrawn, so pixels near an
 * edge flip between two colours as the map turns (2.7% of them per pixel of
 * movement at sharpness 12, measured). Averaging the last few frames turns
 * those flips into small steps without softening anything that holds still,
 * which a lower sharpness would. The ground does not move, only the view, so
 * the earlier frames line up exactly; and history is only allowed the colours
 * around it in the new frame, so nothing trails.
 */
export const TEMPORAL_BLEND = 0.25;

const RESOLVE_SHADER = `
precision mediump float;
uniform sampler2D u_current;
uniform sampler2D u_history;
uniform vec2 u_size;
uniform vec2 u_prevSize;
/** This frame's pixel to where the same ground was in the last frame. */
uniform vec4 u_toPrev;
uniform vec2 u_toPrevOffset;
uniform float u_blend;

void main() {
    vec2 frag = gl_FragCoord.xy;
    vec4 current = texture2D(u_current, frag / u_size);
    vec2 previous = vec2(u_toPrev.x * frag.x + u_toPrev.z * frag.y, u_toPrev.y * frag.x + u_toPrev.w * frag.y) + u_toPrevOffset;
    if (u_blend >= 1.0 || previous.x < 0.0 || previous.y < 0.0 || previous.x > u_prevSize.x || previous.y > u_prevSize.y) {
        gl_FragColor = current;
        return;
    }
    vec4 history = texture2D(u_history, previous / u_prevSize);
    // Only the colours already round this pixel: a flip between two of them
    // is held, anything else in the history is let go.
    vec4 low = current;
    vec4 high = current;
    vec4 n;
    n = texture2D(u_current, (frag + vec2(1.0, 0.0)) / u_size); low = min(low, n); high = max(high, n);
    n = texture2D(u_current, (frag - vec2(1.0, 0.0)) / u_size); low = min(low, n); high = max(high, n);
    n = texture2D(u_current, (frag + vec2(0.0, 1.0)) / u_size); low = min(low, n); high = max(high, n);
    n = texture2D(u_current, (frag - vec2(0.0, 1.0)) / u_size); low = min(low, n); high = max(high, n);
    gl_FragColor = mix(clamp(history, low, high), current, u_blend);
}
`;

const COPY_SHADER = `
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_size;
void main() {
    gl_FragColor = texture2D(u_image, gl_FragCoord.xy / u_size);
}
`;

/** A texture to draw into, and the framebuffer that draws into it. */
interface Target {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    width: number;
    height: number;
}

function createTarget(gl: WebGLRenderingContext): Target {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("could not create a render target");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer, width: 1, height: 1 };
}

function sizeTarget(gl: WebGLRenderingContext, target: Target, width: number, height: number) {
    if (target.width === width && target.height === height) return;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    target.width = width;
    target.height = height;
}

function link(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error("createProgram failed");
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
    // Every program draws the same quad from attribute 0.
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
}

/** True when two transforms put every pixel within a hair of the same place. */
function sameTransform(a: Transform, size: [number, number], prevSize: [number, number]): boolean {
    return (
        size[0] === prevSize[0] &&
        size[1] === prevSize[1] &&
        Math.abs(a[0] - 1) < 1e-6 &&
        Math.abs(a[1]) < 1e-6 &&
        Math.abs(a[2]) < 1e-6 &&
        Math.abs(a[3] - 1) < 1e-6 &&
        Math.abs(a[4]) < 1e-3 &&
        Math.abs(a[5]) < 1e-3
    );
}

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

// A pass sets every uniform; one its shader does not declare has a null
// location, and setting a null location is a no-op in WebGL.
const UNIFORMS = [
    "step", "outToCanvas", "outHeight", "outOrigin", "texOrigin", "texSpan", "canvasToMap", "canvasMapOffset",
    "radius", "sharpness", "wobble", "wobbleScale", "grain", "floor", "ceiling", "original",
    "mapToCanvas", "mapToCanvasOffset", "mapToScreen", "screenToMap", "screenPerOut",
    "cell", "turn", "shift", "overlap", "border", "bands", "planes",
] as const;
type UniformName = (typeof UNIFORMS)[number];

class PaintPass {
    readonly canvas = document.createElement("canvas");
    private readonly gl: WebGLRenderingContext;
    private readonly program: WebGLProgram;
    private readonly texture: WebGLTexture;
    private readonly uniforms: Record<UniformName, WebGLUniformLocation | null>;
    private readonly stopLocations: (WebGLUniformLocation | null)[];
    /** Halving steps between the map canvas and the texture. */
    private readonly shrinkCanvases: HTMLCanvasElement[] = [];
    private lost = false;
    /** This frame's painting, the blend of it with the frames before, and that blend last frame. */
    private readonly painting: Target;
    private resolved: Target;
    private history: Target;
    private readonly resolveProgram: WebGLProgram;
    private readonly copyProgram: WebGLProgram;
    private readonly resolveUniforms: Record<"size" | "prevSize" | "toPrev" | "toPrevOffset" | "blend", WebGLUniformLocation | null>;
    private readonly copySize: WebGLUniformLocation | null;
    /** Map coordinates to last frame's output pixels, and what painted it. */
    private previous: { mapToFrag: Transform; size: [number, number]; tuning: PaintTuning } | null = null;

    constructor(
        private readonly toneName: PaintedToneName,
        private readonly style: PaintStyle,
    ) {
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

        const program = link(gl, (style === "collage" ? collageShader : brushShader)(tone));
        this.program = program;
        this.resolveProgram = link(gl, RESOLVE_SHADER);
        this.copyProgram = link(gl, COPY_SHADER);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.useProgram(this.resolveProgram);
        gl.uniform1i(gl.getUniformLocation(this.resolveProgram, "u_current"), 0);
        gl.uniform1i(gl.getUniformLocation(this.resolveProgram, "u_history"), 1);
        this.resolveUniforms = {
            size: gl.getUniformLocation(this.resolveProgram, "u_size"),
            prevSize: gl.getUniformLocation(this.resolveProgram, "u_prevSize"),
            toPrev: gl.getUniformLocation(this.resolveProgram, "u_toPrev"),
            toPrevOffset: gl.getUniformLocation(this.resolveProgram, "u_toPrevOffset"),
            blend: gl.getUniformLocation(this.resolveProgram, "u_blend"),
        };
        gl.useProgram(this.copyProgram);
        gl.uniform1i(gl.getUniformLocation(this.copyProgram, "u_image"), 0);
        this.copySize = gl.getUniformLocation(this.copyProgram, "u_size");
        this.painting = createTarget(gl);
        this.resolved = createTarget(gl);
        this.history = createTarget(gl);
        gl.useProgram(program);

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
        gl.uniform3fv(gl.getUniformLocation(program, "u_printEdge"), tokenRgb("ground"));

        this.canvas.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            this.lost = true;
        });
    }

    get usable(): boolean {
        return !this.lost;
    }

    /**
     * The map canvas resampled to a texture whose texels sit on a lattice
     * fixed to the ground: texel (0, 0) covers `texelPx` canvas pixels from
     * (x0, y0), and the texture is `width` x `height` texels.
     *
     * Fixed to the ground because the canvas is not: OpenLayers moves and
     * resizes it every frame as the map pans and turns, and a texture cut
     * from wherever the canvas happens to start resamples the same ground a
     * little differently each time, which a sharp brush turns into flicker.
     * One scale step down to a power of two of the texel, then exact halvings,
     * never more than half at once so nothing aliases on the way.
     */
    private shrink(source: HTMLCanvasElement, x0: number, y0: number, texelPx: number, width: number, height: number): HTMLCanvasElement {
        const levels = Math.max(0, Math.floor(Math.log2(texelPx)));
        const first = texelPx / 2 ** levels;
        let w = width * 2 ** levels;
        let h = height * 2 ** levels;
        let current: HTMLCanvasElement | null = null;
        for (let level = 0; level <= levels; level++) {
            const canvas = (this.shrinkCanvases[level] ??= document.createElement("canvas"));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            const context = canvas.getContext("2d");
            if (!context) throw new Error("2d context unavailable");
            context.globalCompositeOperation = "source-over";
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.clearRect(0, 0, w, h);
            if (!current) {
                // Clipped by hand: older Safari draws nothing at all when the
                // source rectangle runs off the image.
                const sx = Math.max(0, x0);
                const sy = Math.max(0, y0);
                const ex = Math.min(source.width, x0 + w * first);
                const ey = Math.min(source.height, y0 + h * first);
                if (ex > sx && ey > sy) {
                    context.drawImage(source, sx, sy, ex - sx, ey - sy, (sx - x0) / first, (sy - y0) / first, (ex - sx) / first, (ey - sy) / first);
                }
            } else {
                context.drawImage(current, 0, 0, w, h);
            }
            current = canvas;
            w /= 2;
            h /= 2;
        }
        return current!;
    }

    /**
     * Paints `source`, the tile layer's canvas, with `tuning` and returns the
     * canvas holding it. The transforms are OpenLayers' [a, b, c, d, e, f]:
     * `canvasToMap` and `mapToCanvas` between the source's own pixels and map
     * coordinates, and `mapToScreen` and `screenToMap` between map
     * coordinates and the screen's CSS pixels, which differ from the canvas
     * whenever the map is turned. `origin` is taken off map coordinates.
     */
    render(
        source: HTMLCanvasElement,
        tuning: PaintTuning,
        frame: {
            pixelRatio: number;
            canvasToMap: number[];
            mapToCanvas: number[];
            mapToScreen: number[];
            screenToMap: number[];
            origin: [number, number];
            /** Metres of ground per map unit at the centre of the view. */
            metresPerUnit: number;
        },
    ): { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number } {
        const { gl, uniforms } = this;
        const { pixelRatio, canvasToMap, mapToCanvas, mapToScreen, screenToMap, origin, metresPerUnit } = frame;
        // Where a fixed point on the ground falls on this frame's canvas: the
        // anchor for both grids below, so each lies on a lattice that rides
        // with the ground. The canvas is north-up and only slides against the
        // ground as the map pans and turns, so that is all it takes.
        const anchor = apply(mapToCanvas, [origin[0], origin[1]]);
        const phase = (value: number, period: number) => (((value % period) + period) % period) - period;

        // The output: one pixel per `outPx` canvas pixels, starting a pixel
        // before the canvas so it covers it however the lattice falls.
        const outPx = pixelRatio / tuning.resolution;
        const outX0 = phase(anchor[0], outPx);
        const outY0 = phase(anchor[1], outPx);
        const outWidth = Math.max(1, Math.ceil((source.width - outX0) / outPx) + 1);
        const outHeight = Math.max(1, Math.ceil((source.height - outY0) / outPx) + 1);

        // The photograph: one texel per `texelPx` canvas pixels, with a margin
        // for the brush's reach. The collage shows the photograph itself, so
        // it keeps a texel per CSS pixel; the brush only needs one per step.
        const texelSpacing = this.style === "collage" ? 1 : tuning.brushStep;
        const texelPx = pixelRatio * texelSpacing;
        const texX0 = phase(anchor[0], texelPx) - texelPx;
        const texY0 = phase(anchor[1], texelPx) - texelPx;
        const texWidth = Math.max(1, Math.ceil((source.width - texX0) / texelPx) + 2);
        const texHeight = Math.max(1, Math.ceil((source.height - texY0) / texelPx) + 2);
        const texture = this.shrink(source, texX0, texY0, texelPx, texWidth, texHeight);
        const tone = tuning.tones[this.toneName];

        if (this.canvas.width !== outWidth || this.canvas.height !== outHeight) {
            this.canvas.width = outWidth;
            this.canvas.height = outHeight;
        }
        sizeTarget(gl, this.painting, outWidth, outHeight);
        sizeTarget(gl, this.resolved, outWidth, outHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.painting.framebuffer);
        gl.viewport(0, 0, outWidth, outHeight);
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // Throws a SecurityError if any tile on the canvas was not CORS-clean.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
        gl.uniform2f(uniforms.step, 1 / texture.width, 1 / texture.height);
        gl.uniform2f(uniforms.outToCanvas, outPx, outPx);
        gl.uniform1f(uniforms.outHeight, outHeight);
        gl.uniform2f(uniforms.outOrigin, outX0, outY0);
        gl.uniform2f(uniforms.texOrigin, texX0, texY0);
        gl.uniform2f(uniforms.texSpan, texWidth * texelPx, texHeight * texelPx);
        const [a, b, c, d, e, f] = canvasToMap;
        gl.uniform4f(uniforms.canvasToMap, a, b, c, d);
        gl.uniform2f(uniforms.canvasMapOffset, e - origin[0], f - origin[1]);
        gl.uniform1f(uniforms.radius, tuning.radius);
        gl.uniform1f(uniforms.sharpness, tuning.sharpness);
        gl.uniform1f(uniforms.wobble, tuning.wobble);
        gl.uniform1f(uniforms.wobbleScale, tuning.wobbleScale);
        gl.uniform1f(uniforms.grain, tuning.grain);
        gl.uniform1f(uniforms.floor, tone.floor);
        gl.uniform1f(uniforms.ceiling, tuning.ceiling);
        gl.uniform1f(uniforms.original, tone.original);
        this.stopLocations.forEach((location, index) => gl.uniform1f(location, tone.stops[index]));
        // Map to canvas, with the origin folded back in: px = A(g + origin) + t.
        const [ia, ib, ic, id, ie, iff] = mapToCanvas;
        gl.uniform4f(uniforms.mapToCanvas, ia, ib, ic, id);
        gl.uniform2f(uniforms.mapToCanvasOffset, ia * origin[0] + ic * origin[1] + ie, ib * origin[0] + id * origin[1] + iff);
        gl.uniform4f(uniforms.mapToScreen, mapToScreen[0], mapToScreen[1], mapToScreen[2], mapToScreen[3]);
        gl.uniform4f(uniforms.screenToMap, screenToMap[0], screenToMap[1], screenToMap[2], screenToMap[3]);
        gl.uniform1f(uniforms.screenPerOut, outPx / pixelRatio);
        const { collage } = tuning;
        gl.uniform1f(uniforms.cell, collage.fragment / metresPerUnit);
        gl.uniform1f(uniforms.turn, (collage.rotation * Math.PI) / 180);
        gl.uniform1f(uniforms.shift, collage.shift);
        gl.uniform1f(uniforms.overlap, collage.overlap);
        gl.uniform1f(uniforms.border, collage.border);
        gl.uniform1f(uniforms.bands, collage.bands);
        gl.uniform1f(uniforms.planes, collage.planes);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Output pixel (gl_FragCoord, y up) to map coordinates, this frame.
        const fragToMap = multiply(canvasToMap.slice() as Transform, [outPx, 0, 0, -outPx, outX0, outHeight * outPx + outY0]);
        const size: [number, number] = [outWidth, outHeight];
        let blend = TEMPORAL_BLEND;
        let toPrev: Transform = [1, 0, 0, 1, 0, 0];
        const { previous } = this;
        if (!previous || previous.tuning !== tuning) {
            // Nothing to line up with, or a slider just moved: show it now.
            blend = 1;
        } else {
            toPrev = multiply(previous.mapToFrag.slice() as Transform, fragToMap);
            // The view has not moved, so the new frame is the answer as it
            // stands; blending would only make a still map settle slowly.
            if (sameTransform(toPrev, size, previous.size)) blend = 1;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolved.framebuffer);
        gl.viewport(0, 0, outWidth, outHeight);
        gl.useProgram(this.resolveProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.painting.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.history.texture);
        gl.uniform2f(this.resolveUniforms.size, outWidth, outHeight);
        gl.uniform2f(this.resolveUniforms.prevSize, this.history.width, this.history.height);
        gl.uniform4f(this.resolveUniforms.toPrev, toPrev[0], toPrev[1], toPrev[2], toPrev[3]);
        gl.uniform2f(this.resolveUniforms.toPrevOffset, toPrev[4], toPrev[5]);
        gl.uniform1f(this.resolveUniforms.blend, blend);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, outWidth, outHeight);
        gl.useProgram(this.copyProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.resolved.texture);
        gl.uniform2f(this.copySize, outWidth, outHeight);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        [this.history, this.resolved] = [this.resolved, this.history];
        this.previous = { mapToFrag: invert(fragToMap.slice() as Transform), size, tuning };
        return { canvas: this.canvas, x: outX0, y: outY0, width: outWidth * outPx, height: outHeight * outPx };
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
export function createPaintedBasemapListener(
    toneName: PaintedToneName = DEFAULT_PAINTED_TONE,
    style: PaintStyle = "brush",
): {
    listener: (event: RenderEvent) => void;
    dispose: () => void;
} | null {
    let pass: PaintPass;
    try {
        pass = new PaintPass(toneName, style);
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
        // Screen CSS pixels to this canvas's pixels; it carries the turn.
        const screenToCanvas = event.inversePixelTransform;
        if (!screenToCanvas) {
            return;
        }
        const canvasToMap = multiply(
            frameState.pixelToCoordinateTransform.slice() as Transform,
            invert(screenToCanvas.slice() as Transform),
        );
        const mapToCanvas = multiply(screenToCanvas.slice() as Transform, frameState.coordinateToPixelTransform);
        const centreY = frameState.viewState.center[1];
        // Web Mercator: a map unit covers cos(latitude) metres of ground.
        const latitude = 2 * Math.atan(Math.exp(centreY / 6378137)) - Math.PI / 2;
        // Fixed for the life of the pass, so the ground's texture does not
        // jump; only there to keep the shader's numbers small.
        origin ??= [Math.round(canvasToMap[4]), Math.round(canvasToMap[5])];

        let painted: ReturnType<PaintPass["render"]>;
        try {
            painted = pass.render(source, getPaintTuning(), {
                pixelRatio,
                canvasToMap,
                mapToCanvas,
                mapToScreen: frameState.coordinateToPixelTransform,
                screenToMap: frameState.pixelToCoordinateTransform,
                origin,
                metresPerUnit: Math.cos(latitude),
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
        // At its place on the ground, which is a fraction of a pixel off the
        // canvas's own grid; drawn with smoothing, so moving it is smooth.
        context.drawImage(painted.canvas, painted.x, painted.y, painted.width, painted.height);
        context.restore();
    };

    return { listener, dispose: () => pass.dispose() };
}
