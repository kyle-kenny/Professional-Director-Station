import { describe, expect, it } from 'vitest';
import { actorSchema, type Actor } from '../domain/model';
import { jointDrivenByIk, presetRigForActor } from '../characters/rigRuntime';

function actorFixture(heightM: number, pose: string): Actor {
  return actorSchema.parse({
    id: `actor-${pose}-${heightM}`,
    name: '动作测试演员',
    demographics: {
      sex: 'female', ageGroup: 'adult', ageYears: 28, heightM,
      shoulderWidthM: Math.min(0.8, heightM * 0.25), bodyDepthM: Math.min(0.6, heightM * 0.16), headRadiusM: Math.min(0.35, heightM * 0.105), posture: 'upright',
    },
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    eyeHeight: heightM * 0.93,
    pose,
    action: 'idle',
    path: [],
  });
}

describe('动作库人体手位', () => {
  it('叉腰使用双手 IK，手位随人物身高等比例缩放', () => {
    const shortRig = presetRigForActor(actorFixture(1.5, 'hands-on-hips'));
    const tallRig = presetRigForActor(actorFixture(2.0, 'hands-on-hips'));
    expect(shortRig.ik.leftHand.enabled).toBe(true);
    expect(shortRig.ik.rightHand.enabled).toBe(true);
    expect(shortRig.ik.leftHand.target?.x).toBeCloseTo(-0.24, 6);
    expect(tallRig.ik.leftHand.target?.x).toBeCloseTo(-0.32, 6);
    expect((tallRig.ik.leftHand.target?.y ?? 0) / (shortRig.ik.leftHand.target?.y ?? 1)).toBeCloseTo(2 / 1.5, 6);
  });

  it('拉弓满弦把持弓手送到可达前方，并让拉弦手停在面部附近', () => {
    const height = 1.8;
    const rig = presetRigForActor(actorFixture(height, 'archery-draw'));
    const bowHand = rig.ik.leftHand.target!;
    const stringHand = rig.ik.rightHand.target!;
    expect(rig.ik.leftHand.enabled).toBe(true);
    expect(rig.ik.rightHand.enabled).toBe(true);
    expect(bowHand.z).toBeLessThan(-0.5);
    expect(bowHand.z).toBeGreaterThan(-0.7);
    expect(stringHand.y).toBeGreaterThan(1.45);
    expect(Math.abs(stringHand.z)).toBeLessThan(0.1);
    const nominalLeftShoulder = { x: -0.125 * height, y: 0.82 * height, z: 0 };
    const reach = Math.hypot(bowHand.x - nominalLeftShoulder.x, bowHand.y - nominalLeftShoulder.y, bowHand.z - nominalLeftShoulder.z);
    expect(reach).toBeLessThan(0.38 * height);
  });

  it('手部 IK 只负责手位，手腕仍保留独立 FK 朝向调节', () => {
    const rig = presetRigForActor(actorFixture(1.8, 'two-hand-hold'));
    expect(jointDrivenByIk(rig, 'upperarm_l')).toBe(true);
    expect(jointDrivenByIk(rig, 'lowerarm_l')).toBe(true);
    expect(jointDrivenByIk(rig, 'hand_l')).toBe(false);
    expect(jointDrivenByIk(rig, 'hand_r')).toBe(false);
  });
});
