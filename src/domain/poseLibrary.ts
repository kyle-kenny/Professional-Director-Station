import type { Vec3 } from './model';
import type { HumanoidJointId } from './humanoidRig';

export type DirectorJoint = 'torso' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export const posePresetIds = [
  'neutral-standing', 'relaxed-standing', 'attention-standing', 'dialogue-open', 'hands-on-hips', 'pointing', 'defensive',
  'crouch', 'deep-squat', 'seated', 'seated-relaxed', 'stand-up', 'kneel-left', 'kneel-right',
  'walk-stride', 'walk-stride-reverse', 'stroll', 'run-stride', 'run-stride-reverse', 'sprint-start',
  'jump-ready', 'jump-air', 'landing',
  'archery-ready', 'archery-draw', 'archery-release',
  'sword-guard', 'two-hand-hold', 'reach-up', 'pick-up', 'push-forward', 'pull-back', 'punch', 'kick', 'carry-cradle',
] as const;

export type PosePresetId = typeof posePresetIds[number];

export type PoseDefinition = {
  id: PosePresetId;
  label: string;
  action: string;
  category: '站立' | '移动' | '坐蹲' | '跳跃' | '武器/动作' | '互动';
  rootOffsetY: number;
  jointRotations: Partial<Record<DirectorJoint, Vec3>>;
  /** Optional detailed Humanoid rotations layered on top of the six director joints. */
  rigRotations?: Partial<Record<HumanoidJointId, Vec3>>;
};

const r = (deg: number) => deg * Math.PI / 180;
const v = (x = 0, y = 0, z = 0): Vec3 => ({ x: r(x), y: r(y), z: r(z) });

export const poseLibrary: Record<PosePresetId, PoseDefinition> = {
  'neutral-standing': { id: 'neutral-standing', label: '中性站立', action: 'idle', category: '站立', rootOffsetY: 0, jointRotations: {} },
  'relaxed-standing': { id: 'relaxed-standing', label: '放松站立', action: 'relaxed', category: '站立', rootOffsetY: -0.01, jointRotations: { torso: v(3, 3, 0), head: v(-2, -4, 0), leftArm: v(10, 0, 10), rightArm: v(6, 0, -12), leftLeg: v(-3, 0, 2), rightLeg: v(4, 0, -2) } },
  'attention-standing': { id: 'attention-standing', label: '立正/正式站姿', action: 'attention', category: '站立', rootOffsetY: 0, jointRotations: { torso: v(-2, 0, 0), leftArm: v(2, 0, 3), rightArm: v(2, 0, -3), leftLeg: v(0, 0, 1), rightLeg: v(0, 0, -1) } },
  'dialogue-open': { id: 'dialogue-open', label: '开放式对话', action: 'dialogue', category: '站立', rootOffsetY: 0, jointRotations: { leftArm: v(8, 0, 28), rightArm: v(-8, 0, -34), torso: v(0, -5, 0), head: v(0, 7, 0) }, rigRotations: { lowerarm_l: v(28, 0, 0), lowerarm_r: v(35, 0, 0) } },
  'hands-on-hips': { id: 'hands-on-hips', label: '叉腰', action: 'hold', category: '站立', rootOffsetY: 0, jointRotations: { leftArm: v(0, 0, 58), rightArm: v(0, 0, -58), torso: v(-3, 0, 0) }, rigRotations: { lowerarm_l: v(95, 10, 12), lowerarm_r: v(95, -10, -12), hand_l: v(0, 0, -15), hand_r: v(0, 0, 15) } },
  pointing: { id: 'pointing', label: '单手指向', action: 'point', category: '互动', rootOffsetY: 0, jointRotations: { rightArm: v(-72, 0, -8), leftArm: v(8, 0, 18), torso: v(0, -8, 0), head: v(0, -10, 0) }, rigRotations: { lowerarm_r: v(6, 0, 0), hand_r: v(-6, 0, 0) } },
  defensive: { id: 'defensive', label: '防御/警戒', action: 'guard', category: '武器/动作', rootOffsetY: -0.03, jointRotations: { leftArm: v(-48, 8, 34), rightArm: v(-52, -8, -34), leftLeg: v(7, 0, 4), rightLeg: v(-6, 0, -4), torso: v(8, 0, 0) }, rigRotations: { lowerarm_l: v(72, 6, 0), lowerarm_r: v(72, -6, 0) } },

  crouch: { id: 'crouch', label: '低姿/半蹲', action: 'crouch', category: '坐蹲', rootOffsetY: -0.22, jointRotations: { torso: v(22, 0, 0), leftLeg: v(-34, 0, 4), rightLeg: v(-34, 0, -4), leftArm: v(18, 0, 16), rightArm: v(18, 0, -16) }, rigRotations: { calf_l: v(58, 0, 0), calf_r: v(58, 0, 0), foot_l: v(-16, 0, 0), foot_r: v(-16, 0, 0) } },
  'deep-squat': { id: 'deep-squat', label: '深蹲', action: 'squat', category: '坐蹲', rootOffsetY: -0.46, jointRotations: { torso: v(30, 0, 0), leftLeg: v(-62, 0, 8), rightLeg: v(-62, 0, -8), leftArm: v(-22, 0, 18), rightArm: v(-22, 0, -18) }, rigRotations: { calf_l: v(112, 0, 0), calf_r: v(112, 0, 0), foot_l: v(-30, 0, 0), foot_r: v(-30, 0, 0) } },
  seated: { id: 'seated', label: '标准坐姿', action: 'sit', category: '坐蹲', rootOffsetY: -0.42, jointRotations: { torso: v(-5, 0, 0), leftLeg: v(-62, 0, 0), rightLeg: v(-62, 0, 0), leftArm: v(18, 0, 12), rightArm: v(18, 0, -12) }, rigRotations: { calf_l: v(88, 0, 0), calf_r: v(88, 0, 0), lowerarm_l: v(34, 0, 0), lowerarm_r: v(34, 0, 0) } },
  'seated-relaxed': { id: 'seated-relaxed', label: '放松坐姿', action: 'sit-relaxed', category: '坐蹲', rootOffsetY: -0.44, jointRotations: { torso: v(10, 6, 0), leftLeg: v(-54, 8, 4), rightLeg: v(-67, -4, -5), leftArm: v(20, 0, 24), rightArm: v(10, 0, -12) }, rigRotations: { calf_l: v(82, 0, 0), calf_r: v(92, 0, 0), lowerarm_l: v(52, 0, 0), lowerarm_r: v(38, 0, 0) } },
  'stand-up': { id: 'stand-up', label: '起立中', action: 'stand-up', category: '坐蹲', rootOffsetY: -0.22, jointRotations: { torso: v(34, 0, 0), leftLeg: v(-38, 0, 5), rightLeg: v(-28, 0, -3), leftArm: v(12, 0, 18), rightArm: v(8, 0, -18) }, rigRotations: { calf_l: v(62, 0, 0), calf_r: v(48, 0, 0) } },
  'kneel-left': { id: 'kneel-left', label: '左膝跪地', action: 'kneel', category: '坐蹲', rootOffsetY: -0.34, jointRotations: { torso: v(8, 0, 0), leftLeg: v(-72, 0, 3), rightLeg: v(-24, 0, -3), leftArm: v(10, 0, 14), rightArm: v(10, 0, -14) }, rigRotations: { calf_l: v(128, 0, 0), calf_r: v(48, 0, 0), foot_l: v(-18, 0, 0) } },
  'kneel-right': { id: 'kneel-right', label: '右膝跪地', action: 'kneel', category: '坐蹲', rootOffsetY: -0.34, jointRotations: { torso: v(8, 0, 0), leftLeg: v(-24, 0, 3), rightLeg: v(-72, 0, -3), leftArm: v(10, 0, 14), rightArm: v(10, 0, -14) }, rigRotations: { calf_l: v(48, 0, 0), calf_r: v(128, 0, 0), foot_r: v(-18, 0, 0) } },

  'walk-stride': { id: 'walk-stride', label: '行走跨步（左脚前）', action: 'walk', category: '移动', rootOffsetY: 0, jointRotations: { leftArm: v(22, 0, 5), rightArm: v(-22, 0, -5), leftLeg: v(-24, 0, 0), rightLeg: v(24, 0, 0), torso: v(4, 0, 0) }, rigRotations: { calf_l: v(10, 0, 0), calf_r: v(24, 0, 0) } },
  'walk-stride-reverse': { id: 'walk-stride-reverse', label: '行走跨步（右脚前）', action: 'walk', category: '移动', rootOffsetY: 0, jointRotations: { leftArm: v(-22, 0, 5), rightArm: v(22, 0, -5), leftLeg: v(24, 0, 0), rightLeg: v(-24, 0, 0), torso: v(4, 0, 0) }, rigRotations: { calf_l: v(24, 0, 0), calf_r: v(10, 0, 0) } },
  stroll: { id: 'stroll', label: '散步/慢走', action: 'stroll', category: '移动', rootOffsetY: -0.01, jointRotations: { torso: v(3, 4, 0), leftArm: v(-12, 0, 4), rightArm: v(14, 0, -5), leftLeg: v(14, 0, 0), rightLeg: v(-12, 0, 0), head: v(-2, -5, 0) }, rigRotations: { calf_l: v(18, 0, 0), calf_r: v(8, 0, 0) } },
  'run-stride': { id: 'run-stride', label: '跑步跨步（左脚前）', action: 'run', category: '移动', rootOffsetY: 0.04, jointRotations: { torso: v(15, 0, 0), leftArm: v(44, 0, 8), rightArm: v(-48, 0, -8), leftLeg: v(-46, 0, 0), rightLeg: v(50, 0, 0) }, rigRotations: { lowerarm_l: v(78, 0, 0), lowerarm_r: v(82, 0, 0), calf_l: v(26, 0, 0), calf_r: v(70, 0, 0) } },
  'run-stride-reverse': { id: 'run-stride-reverse', label: '跑步跨步（右脚前）', action: 'run', category: '移动', rootOffsetY: 0.04, jointRotations: { torso: v(15, 0, 0), leftArm: v(-48, 0, 8), rightArm: v(44, 0, -8), leftLeg: v(50, 0, 0), rightLeg: v(-46, 0, 0) }, rigRotations: { lowerarm_l: v(82, 0, 0), lowerarm_r: v(78, 0, 0), calf_l: v(70, 0, 0), calf_r: v(26, 0, 0) } },
  'sprint-start': { id: 'sprint-start', label: '冲刺起跑', action: 'sprint-start', category: '移动', rootOffsetY: -0.18, jointRotations: { torso: v(42, 0, 0), leftArm: v(-58, 0, 15), rightArm: v(55, 0, -15), leftLeg: v(-52, 0, 5), rightLeg: v(30, 0, -5) }, rigRotations: { lowerarm_l: v(88, 0, 0), lowerarm_r: v(92, 0, 0), calf_l: v(82, 0, 0), calf_r: v(38, 0, 0) } },

  'jump-ready': { id: 'jump-ready', label: '起跳准备', action: 'jump-ready', category: '跳跃', rootOffsetY: -0.22, jointRotations: { torso: v(28, 0, 0), leftArm: v(34, 0, 22), rightArm: v(34, 0, -22), leftLeg: v(-42, 0, 5), rightLeg: v(-42, 0, -5) }, rigRotations: { calf_l: v(76, 0, 0), calf_r: v(76, 0, 0) } },
  'jump-air': { id: 'jump-air', label: '腾空跳跃', action: 'jump', category: '跳跃', rootOffsetY: 0.24, jointRotations: { torso: v(-6, 0, 0), leftArm: v(-112, 0, 35), rightArm: v(-112, 0, -35), leftLeg: v(-28, 0, 8), rightLeg: v(-42, 0, -8) }, rigRotations: { calf_l: v(58, 0, 0), calf_r: v(72, 0, 0) } },
  landing: { id: 'landing', label: '落地缓冲', action: 'land', category: '跳跃', rootOffsetY: -0.18, jointRotations: { torso: v(34, 0, 0), leftArm: v(12, 0, 28), rightArm: v(12, 0, -28), leftLeg: v(-48, 0, 5), rightLeg: v(-48, 0, -5) }, rigRotations: { calf_l: v(86, 0, 0), calf_r: v(86, 0, 0), foot_l: v(-18, 0, 0), foot_r: v(-18, 0, 0) } },

  'archery-ready': { id: 'archery-ready', label: '持弓准备', action: 'archery-ready', category: '武器/动作', rootOffsetY: 0, jointRotations: { torso: v(0, -18, 0), leftArm: v(-58, -10, 22), rightArm: v(-26, 8, -34), leftLeg: v(-5, 0, 4), rightLeg: v(5, 0, -4), head: v(0, -16, 0) }, rigRotations: { lowerarm_l: v(10, 0, 0), lowerarm_r: v(78, -12, 4), hand_l: v(0, -8, 0), hand_r: v(12, 8, 0) } },
  'archery-draw': { id: 'archery-draw', label: '拉弓满弦', action: 'archery-draw', category: '武器/动作', rootOffsetY: 0, jointRotations: { torso: v(0, -28, 0), leftArm: v(-82, -8, 10), rightArm: v(-54, 32, -62), leftLeg: v(-8, 0, 5), rightLeg: v(8, 0, -5), head: v(0, -28, 0) }, rigRotations: { clavicle_l: v(0, -8, 12), clavicle_r: v(0, 12, -14), lowerarm_l: v(4, 0, 0), lowerarm_r: v(112, -18, 8), hand_l: v(0, -10, 0), hand_r: v(18, 12, 0) } },
  'archery-release': { id: 'archery-release', label: '弓箭释放', action: 'archery-release', category: '武器/动作', rootOffsetY: 0, jointRotations: { torso: v(0, -24, 0), leftArm: v(-78, -7, 9), rightArm: v(-38, 44, -70), leftLeg: v(-8, 0, 5), rightLeg: v(8, 0, -5), head: v(0, -26, 0) }, rigRotations: { lowerarm_l: v(2, 0, 0), lowerarm_r: v(88, -20, 10), hand_r: v(26, 18, 0) } },
  'sword-guard': { id: 'sword-guard', label: '双手武器警戒', action: 'weapon-guard', category: '武器/动作', rootOffsetY: -0.04, jointRotations: { torso: v(8, -8, 0), leftArm: v(-38, -12, 34), rightArm: v(-45, 12, -30), leftLeg: v(-12, 0, 5), rightLeg: v(12, 0, -5), head: v(0, -6, 0) }, rigRotations: { lowerarm_l: v(92, -8, 0), lowerarm_r: v(88, 8, 0), hand_l: v(8, 0, -10), hand_r: v(8, 0, 10) } },
  'two-hand-hold': { id: 'two-hand-hold', label: '双手持物', action: 'two-hand-hold', category: '武器/动作', rootOffsetY: 0, jointRotations: { leftArm: v(-40, -8, 25), rightArm: v(-40, 8, -25), torso: v(4, 0, 0) }, rigRotations: { lowerarm_l: v(76, 0, 0), lowerarm_r: v(76, 0, 0), hand_l: v(4, 0, -8), hand_r: v(4, 0, 8) } },

  'reach-up': { id: 'reach-up', label: '向上伸手', action: 'reach-up', category: '互动', rootOffsetY: 0, jointRotations: { rightArm: v(-126, 0, -12), leftArm: v(8, 0, 12), torso: v(-6, -5, 0), head: v(-18, -5, 0) }, rigRotations: { lowerarm_r: v(18, 0, 0), hand_r: v(-12, 0, 0) } },
  'pick-up': { id: 'pick-up', label: '弯腰拾取', action: 'pick-up', category: '互动', rootOffsetY: -0.16, jointRotations: { torso: v(42, 0, 0), rightArm: v(42, 0, -16), leftArm: v(18, 0, 12), leftLeg: v(-28, 0, 4), rightLeg: v(-22, 0, -4), head: v(18, 0, 0) }, rigRotations: { calf_l: v(42, 0, 0), calf_r: v(36, 0, 0), lowerarm_r: v(42, 0, 0) } },
  'push-forward': { id: 'push-forward', label: '双手向前推', action: 'push', category: '互动', rootOffsetY: -0.04, jointRotations: { torso: v(18, 0, 0), leftArm: v(-72, -4, 18), rightArm: v(-72, 4, -18), leftLeg: v(-12, 0, 5), rightLeg: v(18, 0, -5) }, rigRotations: { lowerarm_l: v(18, 0, 0), lowerarm_r: v(18, 0, 0), hand_l: v(-8, 0, 0), hand_r: v(-8, 0, 0) } },
  'pull-back': { id: 'pull-back', label: '双手向后拉', action: 'pull', category: '互动', rootOffsetY: -0.08, jointRotations: { torso: v(-12, 0, 0), leftArm: v(-28, -8, 32), rightArm: v(-28, 8, -32), leftLeg: v(12, 0, 5), rightLeg: v(-14, 0, -5) }, rigRotations: { lowerarm_l: v(108, 0, 0), lowerarm_r: v(108, 0, 0) } },
  punch: { id: 'punch', label: '直拳', action: 'punch', category: '武器/动作', rootOffsetY: -0.02, jointRotations: { torso: v(8, -20, 0), rightArm: v(-78, 0, -6), leftArm: v(-34, 8, 28), leftLeg: v(-10, 0, 4), rightLeg: v(12, 0, -4), head: v(0, -12, 0) }, rigRotations: { lowerarm_r: v(8, 0, 0), lowerarm_l: v(86, 0, 0) } },
  kick: { id: 'kick', label: '前踢', action: 'kick', category: '武器/动作', rootOffsetY: 0.02, jointRotations: { torso: v(8, 0, 0), leftArm: v(22, 0, 22), rightArm: v(-18, 0, -18), leftLeg: v(-74, 0, 2), rightLeg: v(8, 0, -2) }, rigRotations: { calf_l: v(18, 0, 0), calf_r: v(8, 0, 0), foot_l: v(18, 0, 0) } },
  'carry-cradle': { id: 'carry-cradle', label: '怀抱/抱物', action: 'carry', category: '互动', rootOffsetY: 0, jointRotations: { leftArm: v(-30, -8, 30), rightArm: v(-30, 8, -30), torso: v(4, 0, 0), head: v(6, 0, 0) }, rigRotations: { lowerarm_l: v(106, 6, 0), lowerarm_r: v(106, -6, 0), hand_l: v(4, 0, -8), hand_r: v(4, 0, 8) } },
};

export const posePresetList = posePresetIds.map((id) => poseLibrary[id]);

export function resolvePoseDefinition(id: string): PoseDefinition {
  return poseLibrary[id as PosePresetId] ?? poseLibrary['neutral-standing'];
}
