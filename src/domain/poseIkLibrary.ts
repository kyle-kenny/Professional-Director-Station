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
 * Targets scale with actor height, while wrist orientation remains authored in FK.
 */
export const poseHandIkHeightRatios: Partial<Record<PosePresetId, Partial<Record<HandId, PoseHandIkPlacement>>>> = {
  'hands-on-hips': {
    leftHand: p([-0.16, 0.57, -0.035], [-0.36, 0.62, -0.01]),
    rightHand: p([0.16, 0.57, -0.035], [0.36, 0.62, -0.01]),
  },
  pointing: {
    rightHand: p([0.05, 0.75, -0.47], [0.24, 0.73, -0.18]),
  },
  defensive: {
    leftHand: p([-0.15, 0.73, -0.20], [-0.34, 0.69, -0.07]),
    rightHand: p([0.15, 0.76, -0.16], [0.34, 0.70, -0.03]),
  },
  'archery-ready': {
    leftHand: p([-0.10, 0.74, -0.40], [-0.29, 0.75, -0.16]),
    rightHand: p([0.18, 0.71, -0.16], [0.35, 0.72, 0.01]),
  },
  'archery-draw': {
    leftHand: p([-0.09, 0.78, -0.53], [-0.28, 0.79, -0.23]),
    rightHand: p([0.18, 0.82, -0.055], [0.36, 0.81, 0.11]),
  },
  'archery-release': {
    leftHand: p([-0.09, 0.78, -0.53], [-0.28, 0.79, -0.23]),
    rightHand: p([0.25, 0.82, 0.015], [0.40, 0.80, 0.16]),
  },
  'sword-guard': {
    leftHand: p([-0.075, 0.68, -0.27], [-0.29, 0.68, -0.10]),
    rightHand: p([0.075, 0.66, -0.25], [0.29, 0.67, -0.09]),
  },
  'two-hand-hold': {
    leftHand: p([-0.10, 0.64, -0.25], [-0.31, 0.65, -0.08]),
    rightHand: p([0.10, 0.64, -0.25], [0.31, 0.65, -0.08]),
  },
  'reach-up': {
    rightHand: p([0.10, 1.02, -0.06], [0.30, 0.92, -0.05]),
  },
  'pick-up': {
    rightHand: p([0.10, 0.25, -0.23], [0.26, 0.45, -0.08]),
  },
  'push-forward': {
    leftHand: p([-0.16, 0.70, -0.47], [-0.32, 0.72, -0.20]),
    rightHand: p([0.16, 0.70, -0.47], [0.32, 0.72, -0.20]),
  },
  'pull-back': {
    leftHand: p([-0.17, 0.67, -0.16], [-0.34, 0.68, 0.02]),
    rightHand: p([0.17, 0.67, -0.16], [0.34, 0.68, 0.02]),
  },
  punch: {
    rightHand: p([0.04, 0.72, -0.52], [0.25, 0.72, -0.20]),
  },
  'carry-cradle': {
    leftHand: p([-0.16, 0.60, -0.18], [-0.31, 0.64, -0.02]),
    rightHand: p([0.16, 0.58, -0.18], [0.31, 0.62, -0.02]),
  },
};
