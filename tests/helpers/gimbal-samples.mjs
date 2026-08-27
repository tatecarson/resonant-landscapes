/**
 * Shared sample sweep for the Gimbal characterization test.
 *
 * Drives the orientation math over its real input ranges — alpha [0,360),
 * beta [-180,180], gamma [-90,90] — in both the desktop case (window.orientation
 * undefined, so eulerOrigin stays identity) and the mobile case (eulerOrigin set
 * from the screen orientation), plus the recalibrated path.
 */

export const ORIENTATIONS = [undefined, 0, 90, -90, 180];

export const ANGLES = [
    { alpha: 0, beta: 0, gamma: 0 },
    { alpha: 45, beta: 30, gamma: 15 },
    { alpha: 90, beta: -45, gamma: 60 },
    { alpha: 180, beta: 90, gamma: -90 },
    { alpha: 270, beta: -90, gamma: 90 },
    { alpha: 359.9, beta: 179.9, gamma: 89.9 },
    { alpha: 12.5, beta: -170.25, gamma: -33.75 },
    { alpha: 300, beta: 5, gamma: -5 },
];

/** Every (screen orientation x angles x recalibrated?) combination. */
export function buildCases() {
    const cases = [];
    for (const orientation of ORIENTATIONS) {
        for (const angles of ANGLES) {
            for (const recalibrate of [false, true]) {
                cases.push({ orientation, angles, recalibrate });
            }
        }
    }
    return cases;
}

/**
 * Run one case against a Gimbal class and return its readable angles.
 * Stubs `window` the way the browser would present it, since the constructor
 * reads window.orientation and probes for deviceorientationabsolute.
 */
/**
 * @param {new () => any} GimbalClass
 * @param {{ orientation?: number, angles: { alpha: number, beta: number, gamma: number }, recalibrate: boolean }} testCase
 */
export function runCase(GimbalClass, { orientation, angles, recalibrate }) {
    const previousWindow = globalThis.window;

    const listeners = new Map();
    globalThis.window = {
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name) => listeners.delete(name),
    };
    if (orientation !== undefined) {
        globalThis.window.orientation = orientation;
    }

    try {
        const gimbal = new GimbalClass();

        if (recalibrate) {
            gimbal.recalibrate();
            // Recalibration happens on the next sensor sample, so feed one.
            gimbal.onSensorMove({ alpha: angles.alpha, beta: angles.beta, gamma: angles.gamma });
        }

        gimbal.onSensorMove({ alpha: angles.alpha, beta: angles.beta, gamma: angles.gamma });
        gimbal.update();

        const vec = (v) => ({ x: v.x, y: v.y, z: v.z });

        return {
            yaw: gimbal.yaw,
            pitch: gimbal.pitch,
            roll: gimbal.roll,
            // vectorFwd.y in particular is not recoverable from the three
            // angles, and it is fed straight to setListenerOrientation.
            vectorUp: vec(gimbal.vectorUp),
            vectorFwd: vec(gimbal.vectorFwd),
        };
    } finally {
        globalThis.window = previousWindow;
    }
}
