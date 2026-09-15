import { describe, expect, it } from 'vitest';
import { analyzeFrameControls, openPoseKeypointIds } from '../ai/controlAnalysis';
import { createDefaultProject } from '../domain/defaultProject';
import { emptyRigState } from '../domain/humanoidRig';

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('PDS 1.7 Stage control maps', () => {
  it('projects one deterministic OpenPose-compatible skeleton per Stage actor', () => {
    const shot = createDefaultProject().sequences[0].shots[0];
    const first = analyzeFrameControls(shot, 0);
    const second = analyzeFrameControls(shot, 0);

    expect(first).toEqual(second);
    expect(first.pose2d).toHaveLength(shot.actors.length);
    for (const actor of first.pose2d) {
      expect(Object.keys(actor.keypoints).sort()).toEqual([...openPoseKeypointIds].sort());
      for (const point of Object.values(actor.keypoints)) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(Number.isFinite(point.cameraDepthM)).toBe(true);
      }
    }
  });

  it('moves projected hand control when frame-authoritative IK changes', () => {
    const project = createDefaultProject();
    const shot = structuredClone(project.sequences[0].shots[0]);
    const actor = shot.actors[0];
    const base = analyzeFrameControls(shot, 0).pose2d[0].keypoints.rWrist;

    const rig = emptyRigState();
    rig.ik.rightHand = {
      enabled: true,
      locked: false,
      target: { x: actor.demographics.shoulderWidthM * 1.4, y: actor.demographics.heightM * 0.82, z: -0.25 },
      pole: { x: actor.demographics.shoulderWidthM, y: actor.demographics.heightM * 0.72, z: -0.5 },
    };
    actor.rig = rig;

    const posed = analyzeFrameControls(shot, 0).pose2d[0].keypoints.rWrist;
    expect(distance(base, posed)).toBeGreaterThan(0.01);
  });

  it('keeps control-map dimensions tied to the current camera projection rather than pixel resolution', () => {
    const shot = createDefaultProject().sequences[0].shots[0];
    const controls = analyzeFrameControls(shot, 0);
    expect(controls.frameAspect).toBe(shot.frameAspect);
    expect(controls.cameraReference.focalLengthMm).toBe(shot.camera.focalLengthMm);
    expect(controls.pose2d.every((actor) => Object.values(actor.keypoints).every((point) => point.x > -10 && point.x < 10 && point.y > -10 && point.y < 10))).toBe(true);
  });
});
