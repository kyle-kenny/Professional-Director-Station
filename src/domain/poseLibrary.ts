import type { Vec3 } from './model';

export type DirectorJoint = 'torso' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type PosePresetId = 'neutral-standing' | 'dialogue-open' | 'hands-on-hips' | 'pointing' | 'defensive' | 'crouch' | 'seated' | 'walk-stride';

export type PoseDefinition = {
  id: PosePresetId;
  label: string;
  action: string;
  rootOffsetY: number;
  jointRotations: Partial<Record<DirectorJoint, Vec3>>;
};

const r = (deg: number) => deg * Math.PI / 180;
const v = (x = 0, y = 0, z = 0): Vec3 => ({ x: r(x), y: r(y), z: r(z) });

export const poseLibrary: Record<PosePresetId, PoseDefinition> = {
  'neutral-standing': { id: 'neutral-standing', label: '中性站立', action: 'idle', rootOffsetY: 0, jointRotations: {} },
  'dialogue-open': { id: 'dialogue-open', label: '开放式对话', action: 'dialogue', rootOffsetY: 0, jointRotations: { leftArm: v(8, 0, 28), rightArm: v(-8, 0, -34), torso: v(0, -5, 0), head: v(0, 7, 0) } },
  'hands-on-hips': { id: 'hands-on-hips', label: '叉腰', action: 'hold', rootOffsetY: 0, jointRotations: { leftArm: v(0, 0, 58), rightArm: v(0, 0, -58), torso: v(-3, 0, 0) } },
  pointing: { id: 'pointing', label: '指向', action: 'point', rootOffsetY: 0, jointRotations: { rightArm: v(-72, 0, -8), leftArm: v(8, 0, 18), torso: v(0, -8, 0), head: v(0, -10, 0) } },
  defensive: { id: 'defensive', label: '防御/警戒', action: 'guard', rootOffsetY: -0.03, jointRotations: { leftArm: v(-48, 8, 34), rightArm: v(-52, -8, -34), leftLeg: v(7, 0, 4), rightLeg: v(-6, 0, -4), torso: v(8, 0, 0) } },
  crouch: { id: 'crouch', label: '低姿/蹲伏', action: 'crouch', rootOffsetY: -0.28, jointRotations: { torso: v(24, 0, 0), leftLeg: v(-28, 0, 4), rightLeg: v(-28, 0, -4), leftArm: v(22, 0, 18), rightArm: v(22, 0, -18) } },
  seated: { id: 'seated', label: '坐姿预演', action: 'sit', rootOffsetY: -0.42, jointRotations: { torso: v(-5, 0, 0), leftLeg: v(-62, 0, 0), rightLeg: v(-62, 0, 0), leftArm: v(18, 0, 12), rightArm: v(18, 0, -12) } },
  'walk-stride': { id: 'walk-stride', label: '行走跨步', action: 'walk', rootOffsetY: 0, jointRotations: { leftArm: v(-22, 0, 5), rightArm: v(22, 0, -5), leftLeg: v(24, 0, 0), rightLeg: v(-24, 0, 0), torso: v(4, 0, 0) } },
};

export const posePresetList = Object.values(poseLibrary);

export function resolvePoseDefinition(id: string): PoseDefinition {
  return poseLibrary[id as PosePresetId] ?? poseLibrary['neutral-standing'];
}
