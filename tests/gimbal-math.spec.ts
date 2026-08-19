/**
 * Characterization test for the orientation math.
 *
 * The golden values in tests/fixtures/gimbal-golden.json were captured from
 * the original three.js-backed implementation. They exist so the hand-rolled
 * quaternion math can be proven equivalent rather than merely plausible —
 * this code decides which way the listener is facing, and a sign error would
 * be inaudible in a unit test but obvious, and unfixable, in a park.
 *
 * Runs in Node (no browser): the Gimbal only touches `window` in its
 * constructor and in enable/disable, and the sample helper stubs that.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import Gimbal from "../src/utils/Gimbal";
import { runCase } from "./helpers/gimbal-samples.mjs";

const here = dirname(fileURLToPath(import.meta.url));

type GoldenCase = {
  orientation?: number;
  angles: { alpha: number; beta: number; gamma: number };
  recalibrate: boolean;
  result: {
    yaw: number;
    pitch: number;
    roll: number;
    vectorUp: { x: number; y: number; z: number };
    vectorFwd: { x: number; y: number; z: number };
  };
};

const golden: GoldenCase[] = JSON.parse(
  readFileSync(join(here, "fixtures", "gimbal-golden.json"), "utf8")
);

// Tight enough to catch a wrong term, loose enough for float reassociation.
const EPSILON = 1e-9;

test("reproduces the original orientation math across the full input sweep", () => {
  expect(golden.length).toBeGreaterThan(0);

  const mismatches: string[] = [];

  for (const entry of golden) {
    const actual = runCase(Gimbal, entry);

    for (const axis of ["yaw", "pitch", "roll"] as const) {
      const expected = entry.result[axis];
      const got = actual[axis];

      if (!Number.isFinite(got)) {
        mismatches.push(
          `${axis} not finite for orientation=${entry.orientation} ${JSON.stringify(entry.angles)}: ${got}`
        );
        continue;
      }

      if (Math.abs(got - expected) > EPSILON) {
        mismatches.push(
          `${axis} orientation=${entry.orientation} ${JSON.stringify(entry.angles)} recal=${entry.recalibrate}: expected ${expected}, got ${got}`
        );
      }
    }

    // These feed setListenerOrientation directly, and vectorFwd.y cannot be
    // derived from the three angles above, so it needs asserting on its own.
    for (const name of ["vectorUp", "vectorFwd"] as const) {
      for (const component of ["x", "y", "z"] as const) {
        const expected = entry.result[name][component];
        const got = actual[name][component];

        if (!Number.isFinite(got) || Math.abs(got - expected) > EPSILON) {
          mismatches.push(
            `${name}.${component} orientation=${entry.orientation} ${JSON.stringify(entry.angles)}: expected ${expected}, got ${got}`
          );
        }
      }
    }
  }

  expect(mismatches.slice(0, 10).join("\n")).toBe("");
});

test("exposes readable angles as numbers once updated", () => {
  const result = runCase(Gimbal, {
    orientation: 90,
    angles: { alpha: 45, beta: 30, gamma: 15 },
    recalibrate: false,
  });

  // Guards the field declarations: these were previously assigned only inside
  // update(), which is why call sites needed a `?? 0` fallback.
  for (const axis of ["yaw", "pitch", "roll"] as const) {
    expect(typeof result[axis]).toBe("number");
  }
});
