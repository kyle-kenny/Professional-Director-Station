import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { actorSchema, type Actor } from '../domain/model';
import { clampJointRotation, emptyRigState, mirrorRigState } from '../domain/humanoidRig';
import { applyRigToCharacter, captureNeutralRigBase, sampleActorRig } from '../characters/rigRuntime';

function actorFixture(): Actor {
  return actorSchema.parse({
    id: 'actor-rig-test', name: '测试演员',
    demographics: { sex: 'male', ageGroup: 'adult', ageYears: 30, heightM: 1.8, shoulderWidthM: 0.46, bodyDepthM: 0.28, headRadiusM: 0.19, posture: 'upright' },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    eyeHeight: 1.67, pose: 'neutral-standing', action: 'idle', path: [],
  });
}

describe('humanoid rig', () => {
  it('clamps additive rotations to director-safe joint limits', () => {
    const result = clampJointRotation('calf_l', { x: -Math.PI, y: Math.PI, z: Math.PI });
    expect(result.x).toBeCloseTo(-5 * Math.PI / 180, 6);
    expect(result.y).toBeCloseTo(20 * Math.PI / 180, 6);
    expect(result.z).toBeCloseTo(20 * Math.PI / 180, 6);
  });

  it('mirrors left/right FK and IK controls across the character sagittal plane', () => {
    const rig = emptyRigState();
    rig.fk.upperarm_l = { x: 0.3, y: 0.2, z: -0.4 };
    rig.ik.leftHand = { enabled: true, locked: false, target: { x: -0.7, y: 1.2, z: -0.2 }, pole: { x: -0.4, y: 1.3, z: -0.6 } };
    rig.headLookAt = { enabled: true, target: { x: 1, y: 1.6, z: -2 } };
    const mirrored = mirrorRigState(rig);
    expect(mirrored.fk.upperarm_r).toEqual({ x: 0.3, y: -0.2, z: 0.4 });
    expect(mirrored.ik.rightHand.target).toEqual({ x: 0.7, y: 1.2, z: -0.2 });
    expect(mirrored.headLookAt.target?.x).toBe(-1);
  });

  it('interpolates pose keyframes on the authoritative timeline', () => {
    const actor = actorFixture();
    const a = emptyRigState(); const b = emptyRigState();
    a.fk.spine_02 = { x: 0, y: 0, z: 0 };
    b.fk.spine_02 = { x: 0.4, y: -0.2, z: 0.1 };
    a.ik.leftHand = { enabled: true, locked: false, target: { x: -0.4, y: 1, z: 0 }, pole: { x: -0.5, y: 1.2, z: -0.4 } };
    b.ik.leftHand = { enabled: true, locked: false, target: { x: -0.8, y: 1.4, z: -0.2 }, pole: { x: -0.6, y: 1.3, z: -0.5 } };
    actor.posePath = [{ time: 0, rig: a, easing: 'linear' }, { time: 2, rig: b, easing: 'linear' }];
    const middle = sampleActorRig(actor, 1);
    expect(middle.fk.spine_02?.x).toBeCloseTo(0.2, 6);
    expect(middle.fk.spine_02?.y).toBeCloseTo(-0.1, 6);
    expect(middle.ik.leftHand.target?.x).toBeCloseTo(-0.6, 6);
    expect(middle.ik.leftHand.target?.y).toBeCloseTo(1.2, 6);
  });

  it('solves a two-bone IK chain to a reachable target without stretching bones', () => {
    const actor = actorFixture();
    const root = new THREE.Group();
    const upper = new THREE.Bone(); upper.name = 'upperarm_l';
    const lower = new THREE.Bone(); lower.name = 'lowerarm_l'; lower.position.set(0, 1, 0);
    const hand = new THREE.Bone(); hand.name = 'hand_l'; hand.position.set(0, 1, 0);
    upper.add(lower); lower.add(hand); root.add(upper);
    captureNeutralRigBase(root);
    const rig = emptyRigState();
    rig.ik.leftHand = { enabled: true, locked: false, target: { x: 1, y: 1, z: 0 }, pole: { x: 0, y: 0.5, z: 1 } };
    applyRigToCharacter(root, actor, rig);
    root.updateWorldMatrix(true, true);
    const end = hand.getWorldPosition(new THREE.Vector3());
    expect(end.distanceTo(new THREE.Vector3(1, 1, 0))).toBeLessThan(0.02);
    expect(upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(1, 5);
    expect(lower.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(1, 5);
  });
});
