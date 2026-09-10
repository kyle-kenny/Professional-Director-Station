import type { Vec3 } from './model';
import type { PosePresetId } from './poseLibrary';

export type PoseHandIkPlacement = {
  /** Root-local coordinates expressed as a ratio of actor height. */
  targetHeightRatio: Vec3;
  /** Elbow pole expressed as a ratio of actor height. */
  poleHeightRatio: Vec3;
};

type HandId = 'leftHand' | 'rightHand';

const p = (target: [number, number, number], pole: [number, number, number]): PoseHandIkPlacement => ({
  targetHeightRatio: { x: target[0], y: target[1], z: target[2] },
  poleHeightRatio: { x: pole[0], y: pole[1], z: pole[2] },
});

/**
 * Contact-critical hand placements for stock poses.
 * FK alone is intentionally not used for these poses because the same shoulder/elbow
 * angles land at visibly different places on characters with different proportions.
 * Targets scale with actor height, remain inside a practical shoulder-to-wrist reach,
 * and leave wrist orientation authored independently in FK.
 */
export const poseHandIkHeightRatios: Partial<Record<PosePresetId, Partial<Record<HandId, PoseHandIkPlacement>>>> = {
  'hands-on-hips': {
    leftHand: p([-0.16, 0.57, -0.035], [-0.34, 0.62, -0.01]),
    rightHand: p([0.16, 0.57, -0.035], [0.34, 0.62, -0.01]),
  },
  pointing: {
    rightHand: p([0.08, 0.75, -0.32], [0.28, 0.75, -0.12]),
  },
  defensive: {
    leftHand: p([-0.15, 0.73, -0.20], [-0.33, 0.70, -0.06]),
    rightHand: p([0.15, 0.76, -0.16], [0.33, 0.71, -0.02]),
  },
  'archery-ready': {
    leftHand: p([-0.09, 0.76, -0.29], [-0.29, 0.77, -0.12]),
    rightHand: p([0.17, 0.74, -0.10], [0.34, 0.75, 0.02]),
  },
  'archery-draw': {
    leftHand: p([-0.085, 0.79, -0.34], [-0.28, 0.80, -0.15]),
    rightHand: p([0.13, 0.84, -0.04], [0.33, 0.82, 0.10]),
  },
  'archery-release': {
    leftHand: p([-0.085, 0.79, -0.34], [-0.28, 0.80, -0.15]),
    rightHand: p([0.22, 0.84, 0.01], [0.38, 0.82, 0.14]),
  },
  'sword-guard': {
    leftHand: p([-0.075, 0.68, -0.22], [-0.28, 0.69, -0.08]),
    rightHand: p([0.075, 0.66, -0.20], [0.28, 0.68, -0.07]),
  },
  'two-hand-hold': {
    leftHand: p([-0.10, 0.64, -0.21], [-0.29, 0.66, -0.07]),
    rightHand: p([0.10, 0.64, -0.21], [0.29, 0.66, -0.07]),
  },
  'reach-up': {
    rightHand: p([0.09, 0.98, -0.04], [0.28, 0.91, -0.03]),
  },
  'push-forward': {
    leftHand: p([-0.14, 0.71, -0.31], [-0.31, 0.73, -0.13]),
    rightHand: p([0.14, 0.71, -0.31], [0.31, 0.73, -0.13]),
  },
  'pull-back': {
    leftHand: p([-0.17, 0.68, -0.12], [-0.33, 0.70, 0.03]),
    rightHand: p([0.17, 0.68, -0.12], [0.33, 0.70, 0.03]),
  },
  punch: {
    rightHand: p([0.07, 0.73, -0.33], [0.28, 0.73, -0.13]),
  },
  'carry-cradle': {
    leftHand: p([-0.15, 0.60, -0.13], [-0.30, 0.64, 0]),
    rightHand: p([0.15, 0.59, -0.13], [0.30, 0.63, 0]),
  },
};
