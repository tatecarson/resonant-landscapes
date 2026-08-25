// Gimbal
// ======
// Transforms device orientation alpha, beta, gamma into readable angles:
// yaw (y-axis), pitch (x-axis), roll (z-axis).
// Derived from https://github.com/marquizzo/three-gimbal/
//
// The rotation pipeline mirrors what three's Object3D did implicitly: a
// quaternion built from the origin Euler, rotated locally about Z/X/Y, then
// round-tripped through Euler so the screen-orientation offset can be
// subtracted from the z component. Output is characterized against the
// original three-backed implementation in tests/gimbal-math.spec.ts.

import {
    applyQuatToVec3,
    eulerFromQuat,
    identityQuat,
    invertQuat,
    multiplyQuats,
    quatFromAxisAngle,
    quatFromEuler,
    type Quat,
    type Vec3,
} from "./quaternion";

const RAD = Math.PI / 180;

const AXIS_X: Vec3 = { x: 1, y: 0, z: 0 };
const AXIS_Y: Vec3 = { x: 0, y: 1, z: 0 };
const AXIS_Z: Vec3 = { x: 0, y: 0, z: 1 };

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const FORWARD: Vec3 = { x: 0, y: 0, z: 1 };

interface OrientationSample {
    alpha: number | null;
    beta: number | null;
    gamma: number | null;
    webkitCompassHeading?: number;
}

interface GimbalData {
    alpha: number;
    beta: number;
    gamma: number;
    orientation: number;
}

class Gimbal {
    // Declared as fields rather than assigned only inside update(), so callers
    // no longer need a `?? 0` fallback to satisfy the type checker.
    yaw = 0;
    pitch = 0;
    roll = 0;

    quaternion: Quat = identityQuat();
    quatOrigin: Quat = identityQuat();
    eulerOrigin: Vec3 = { x: 0, y: 0, z: 0 };

    // Read directly by GimbalArrow to drive setListenerOrientation, so these
    // stay instance state rather than update() locals. Note vectorFwd.y is not
    // recoverable from yaw/pitch/roll, so it needs its own coverage.
    vectorUp: Vec3 = { ...UP };
    vectorFwd: Vec3 = { ...FORWARD };

    data: GimbalData;
    needsUpdate = false;
    recalRequested = false;
    enabled = false;

    private readonly onSensorMoveBound = (event: Event) =>
        this.onSensorMove(event as unknown as OrientationSample);
    private readonly onDeviceReorientationBound = () => this.onDeviceReorientation();
    private readonly orientationEventNames: string[];

    constructor() {
        this.data = {
            alpha: 0,
            beta: 0,
            gamma: 0,
            orientation: window.orientation ? window.orientation : 0,
        };

        this.orientationEventNames = ["deviceorientation"];
        if ("ondeviceorientationabsolute" in window) {
            this.orientationEventNames.unshift("deviceorientationabsolute");
        }

        if (typeof window.orientation !== "undefined") {
            this.eulerOrigin = {
                x: 90 * RAD,
                y: 180 * RAD,
                z: (180 + window.orientation) * RAD,
            };
        }
    }

    /**
     * Build the sensor rotation for the current sample: origin Euler, then
     * local Z/X/Y rotations, then the screen-orientation offset removed from
     * the Euler z component.
     */
    private sensorQuaternion(preRotation?: Quat): Quat {
        let q = quatFromEuler(this.eulerOrigin.x, this.eulerOrigin.y, this.eulerOrigin.z);

        // Object3D.applyQuaternion premultiplies.
        if (preRotation) {
            q = multiplyQuats(preRotation, q);
        }

        // Object3D.rotateZ/X/Y are local rotations, so they postmultiply.
        q = multiplyQuats(q, quatFromAxisAngle(AXIS_Z, this.data.alpha * RAD));
        q = multiplyQuats(q, quatFromAxisAngle(AXIS_X, this.data.beta * RAD));
        q = multiplyQuats(q, quatFromAxisAngle(AXIS_Y, this.data.gamma * RAD));

        // Reading and writing Object3D.rotation round-tripped through Euler,
        // which is lossy near gimbal lock — preserved deliberately, since the
        // characterization fixture encodes that behavior.
        const euler = eulerFromQuat(q);
        return quatFromEuler(euler.x, euler.y, euler.z - this.data.orientation);
    }

    /** Re-zero the axes against the current pose. */
    performRecalibration() {
        this.quatOrigin = invertQuat(this.sensorQuaternion());
        this.recalRequested = false;
    }

    /** Portrait <-> landscape. */
    onDeviceReorientation() {
        this.data.orientation = (window.orientation * RAD) || 0;
    }

    /**
     * Alpha = z axis [0, 360], Beta = x axis [-180, 180], Gamma = y axis [-90, 90].
     * iOS reports true heading separately via webkitCompassHeading.
     */
    onSensorMove(event: OrientationSample) {
        const compassHeading = typeof event.webkitCompassHeading === "number"
            ? event.webkitCompassHeading
            : null;
        const alpha = compassHeading !== null ? 360 - compassHeading : event.alpha;
        const beta = event.beta;
        const gamma = event.gamma;

        if (![alpha, beta, gamma].every((value) => Number.isFinite(value))) {
            return;
        }

        this.data.alpha = alpha as number;
        this.data.beta = beta as number;
        this.data.gamma = gamma as number;
        this.needsUpdate = true;

        if (this.recalRequested) {
            this.performRecalibration();
        }
    }

    enable() {
        if (this.enabled) {
            return;
        }

        this.onDeviceReorientation();

        this.orientationEventNames.forEach((eventName) => {
            window.addEventListener(eventName, this.onSensorMoveBound, false);
        });
        window.addEventListener("orientationchange", this.onDeviceReorientationBound, false);
        this.enabled = true;
    }

    disable() {
        if (!this.enabled) {
            return;
        }

        this.orientationEventNames.forEach((eventName) => {
            window.removeEventListener(eventName, this.onSensorMoveBound, false);
        });
        window.removeEventListener("orientationchange", this.onDeviceReorientationBound, false);
        this.enabled = false;
    }

    /** Recalibration is applied on the next sensor sample. */
    recalibrate() {
        this.recalRequested = true;
    }

    /** Called once per frame; skips work when no new sample has arrived. */
    update() {
        if (this.needsUpdate === false) {
            return;
        }

        this.quaternion = invertQuat(this.sensorQuaternion(this.quatOrigin));

        this.vectorUp = applyQuatToVec3(UP, this.quaternion);
        this.vectorFwd = applyQuatToVec3(FORWARD, this.quaternion);

        // Yaw is heading east (-) or west (+) rotation around the y-axis.
        this.yaw = Math.atan2(this.vectorFwd.x, this.vectorFwd.z);

        // Pitch is pointing above or below (+/-) the horizon line.
        this.pitch = Math.atan2(this.vectorUp.z, this.vectorUp.y);

        // Roll is left (-) or right (+) rotation around the local z-axis.
        this.roll = Math.atan2(-this.vectorUp.x, this.vectorUp.y);

        this.needsUpdate = false;
    }
}

export default Gimbal;
