/**
 * The slice of quaternion math the orientation gimbal needs.
 *
 * These mirror three.js's conventions exactly — XYZ Euler order, the same
 * matrix element layout, the same operand order in the products — because the
 * gimbal's output is characterized against the previous three-backed
 * implementation in tests/gimbal-math.spec.ts. Reassociating any of these
 * expressions will drift the results, so keep the arithmetic as written.
 *
 * Importing three for this pulled in Object3D and with it Matrix4, Matrix3,
 * Layers and EventDispatcher, for four operations on a handful of numbers.
 */

export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export const identityQuat = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

/** Euler angles (radians, XYZ order) to quaternion. */
export function quatFromEuler(x: number, y: number, z: number): Quat {
    const c1 = Math.cos(x / 2);
    const c2 = Math.cos(y / 2);
    const c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2);
    const s2 = Math.sin(y / 2);
    const s3 = Math.sin(z / 2);

    return {
        x: s1 * c2 * c3 + c1 * s2 * s3,
        y: c1 * s2 * c3 - s1 * c2 * s3,
        z: c1 * c2 * s3 + s1 * s2 * c3,
        w: c1 * c2 * c3 - s1 * s2 * s3,
    };
}

/**
 * Quaternion to Euler angles (radians, XYZ order), via the rotation matrix —
 * the same route three takes, including its gimbal-lock branch.
 */
export function eulerFromQuat(q: Quat): Vec3 {
    const { x, y, z, w } = q;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    const m11 = 1 - (yy + zz);
    const m12 = xy - wz;
    const m13 = xz + wy;
    const m22 = 1 - (xx + zz);
    const m23 = yz - wx;
    const m32 = yz + wx;
    const m33 = 1 - (xx + yy);

    const ey = Math.asin(clamp(m13, -1, 1));

    // Near +/-90 degrees of yaw the remaining two axes are degenerate; three
    // resolves it by pinning z and reading x off a different pair.
    if (Math.abs(m13) < 0.9999999) {
        return { x: Math.atan2(-m23, m33), y: ey, z: Math.atan2(-m12, m11) };
    }

    return { x: Math.atan2(m32, m22), y: ey, z: 0 };
}

/** Hamilton product, a * b. */
export function multiplyQuats(a: Quat, b: Quat): Quat {
    return {
        x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
        y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
        z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
}

/** Rotation of `angle` radians about a unit axis. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
    const half = angle / 2;
    const s = Math.sin(half);
    return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) };
}

/** Inverse of a unit quaternion, which is its conjugate. */
export const invertQuat = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Rotate a vector by a unit quaternion. */
export function applyQuatToVec3(v: Vec3, q: Quat): Vec3 {
    const { x: vx, y: vy, z: vz } = v;
    const { x: qx, y: qy, z: qz, w: qw } = q;

    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);

    // v + q.w * t + cross(q.xyz, t)
    return {
        x: vx + qw * tx + qy * tz - qz * ty,
        y: vy + qw * ty + qz * tx - qx * tz,
        z: vz + qw * tz + qx * ty - qy * tx,
    };
}
