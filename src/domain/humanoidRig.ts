import { z } from 'zod';

export const humanoidJointIds = [
  'pelvis',
  'spine_01', 'spine_02', 'spine_03',
  'neck_01', 'Head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l',
  'thigh_r', 'calf_r', 'foot_r',
] as const;

export type HumanoidJointId = typeof humanoidJointIds[number];
export type RigAxis = 'x' | 'y' | 'z';
export type RigVec3 = { x: number; y: number; z: number };

const rigVec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const ikLimbIds = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as const;
export type IkLimbId = typeof ikLimbIds[number];

export const rigControlIds = [
  'leftHandTarget', 'leftElbowPole',
  'rightHandTarget', 'rightElbowPole',
  'leftFootTarget', 'leftKneePole',
  'rightFootTarget', 'rightKneePole',
  'headLookAt',
] as const;
export type RigControlId = typeof rigControlIds[number];

export const ikLimbSchema = z.object({
  enabled: z.boolean().default(false),
  locked: z.boolean().default(false),
  target: rigVec3Schema.optional(),
  pole: rigVec3Schema.optional(),
  lockedWorldTarget: rigVec3Schema.optional(),
});
export type IkLimbState = z.infer<typeof ikLimbSchema>;

export const humanoidRigStateSchema = z.object({
  rootOffsetY: z.number().min(-2).max(2).default(0),
  fk: z.record(z.string(), rigVec3Schema).default({}),
  ik: z.object({
    leftHand: ikLimbSchema.default({ enabled: false, locked: false }),
    rightHand: ikLimbSchema.default({ enabled: false, locked: false }),
    leftFoot: ikLimbSchema.default({ enabled: false, locked: false }),
    rightFoot: ikLimbSchema.default({ enabled: false, locked: false }),
  }).default({
    leftHand: { enabled: false, locked: false },
    rightHand: { enabled: false, locked: false },
    leftFoot: { enabled: false, locked: false },
    rightFoot: { enabled: false, locked: false },
  }),
  headLookAt: z.object({ enabled: z.boolean().default(false), target: rigVec3Schema.optional() }).default({ enabled: false }),
});
export type HumanoidRigState = z.infer<typeof humanoidRigStateSchema>;

export const actorPoseKeyframeSchema = z.object({
  time: z.number().nonnegative(),
  rig: humanoidRigStateSchema,
  easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']).default('ease-in-out'),
});
export type ActorPoseKeyframe = z.infer<typeof actorPoseKeyframeSchema>;

export const customPoseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rig: humanoidRigStateSchema,
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
});
export type CustomPose = z.infer<typeof customPoseSchema>;

export type JointLimit = {
  label: string;
  group: '躯干' | '头颈' | '左臂' | '右臂' | '左腿' | '右腿';
  minDeg: RigVec3;
  maxDeg: RigVec3;
};

const lim = (label: string, group: JointLimit['group'], min: [number, number, number], max: [number, number, number]): JointLimit => ({
  label, group,
  minDeg: { x: min[0], y: min[1], z: min[2] },
  maxDeg: { x: max[0], y: max[1], z: max[2] },
});

/** Director-safe additive limits around the imported humanoid rest pose. */
export const humanoidJointLimits: Record<HumanoidJointId, JointLimit> = {
  pelvis: lim('骨盆', '躯干', [-35, -45, -30], [35, 45, 30]),
  spine_01: lim('腰椎', '躯干', [-35, -35, -30], [45, 35, 30]),
  spine_02: lim('胸椎', '躯干', [-35, -40, -30], [45, 40, 30]),
  spine_03: lim('上胸', '躯干', [-25, -35, -25], [35, 35, 25]),
  neck_01: lim('颈部', '头颈', [-45, -65, -35], [45, 65, 35]),
  Head: lim('头部', '头颈', [-35, -55, -30], [35, 55, 30]),
  clavicle_l: lim('左锁骨', '左臂', [-30, -30, -35], [35, 30, 45]),
  upperarm_l: lim('左上臂', '左臂', [-130, -105, -145], [105, 105, 145]),
  lowerarm_l: lim('左前臂/肘', '左臂', [-10, -45, -45], [155, 45, 45]),
  hand_l: lim('左手腕', '左臂', [-80, -55, -45], [80, 55, 45]),
  clavicle_r: lim('右锁骨', '右臂', [-30, -30, -45], [35, 30, 35]),
  upperarm_r: lim('右上臂', '右臂', [-130, -105, -145], [105, 105, 145]),
  lowerarm_r: lim('右前臂/肘', '右臂', [-10, -45, -45], [155, 45, 45]),
  hand_r: lim('右手腕', '右臂', [-80, -55, -45], [80, 55, 45]),
  thigh_l: lim('左大腿/髋', '左腿', [-120, -55, -55], [65, 55, 55]),
  calf_l: lim('左小腿/膝', '左腿', [-5, -20, -20], [155, 20, 20]),
  foot_l: lim('左脚踝', '左腿', [-55, -35, -30], [55, 35, 30]),
  thigh_r: lim('右大腿/髋', '右腿', [-120, -55, -55], [65, 55, 55]),
  calf_r: lim('右小腿/膝', '右腿', [-5, -20, -20], [155, 20, 20]),
  foot_r: lim('右脚踝', '右腿', [-55, -35, -30], [55, 35, 30]),
};

export const rigControlLabels: Record<RigControlId, string> = {
  leftHandTarget: '左手 IK', leftElbowPole: '左肘方向',
  rightHandTarget: '右手 IK', rightElbowPole: '右肘方向',
  leftFootTarget: '左脚 IK', leftKneePole: '左膝方向',
  rightFootTarget: '右脚 IK', rightKneePole: '右膝方向',
  headLookAt: '头部注视',
};

export const ikLimbLabels: Record<IkLimbId, string> = {
  leftHand: '左手臂', rightHand: '右手臂', leftFoot: '左腿', rightFoot: '右腿',
};

export function clampJointRotation(joint: HumanoidJointId, rotation: RigVec3): RigVec3 {
  const limits = humanoidJointLimits[joint];
  const toRad = Math.PI / 180;
  const clamp = (axis: RigAxis) => Math.min(limits.maxDeg[axis] * toRad, Math.max(limits.minDeg[axis] * toRad, rotation[axis]));
  return { x: clamp('x'), y: clamp('y'), z: clamp('z') };
}

export function emptyRigState(): HumanoidRigState {
  return humanoidRigStateSchema.parse({});
}

export function defaultIkPlacement(heightM: number, limb: IkLimbId): Pick<IkLimbState, 'target' | 'pole'> {
  if (limb === 'leftHand') return { target: { x: -heightM * 0.34, y: heightM * 0.63, z: -heightM * 0.07 }, pole: { x: -heightM * 0.30, y: heightM * 0.70, z: -heightM * 0.28 } };
  if (limb === 'rightHand') return { target: { x: heightM * 0.34, y: heightM * 0.63, z: -heightM * 0.07 }, pole: { x: heightM * 0.30, y: heightM * 0.70, z: -heightM * 0.28 } };
  if (limb === 'leftFoot') return { target: { x: -heightM * 0.055, y: 0.015, z: -heightM * 0.035 }, pole: { x: -heightM * 0.055, y: heightM * 0.28, z: -heightM * 0.28 } };
  return { target: { x: heightM * 0.055, y: 0.015, z: -heightM * 0.035 }, pole: { x: heightM * 0.055, y: heightM * 0.28, z: -heightM * 0.28 } };
}

export function defaultHeadLookAt(heightM: number): RigVec3 {
  return { x: 0, y: heightM * 0.88, z: -Math.max(1.5, heightM * 1.25) };
}

export function mirrorRigState(source: HumanoidRigState): HumanoidRigState {
  const result = structuredClone(source);
  const mirrorRotation = (value?: RigVec3): RigVec3 | undefined => value ? { x: value.x, y: -value.y, z: -value.z } : undefined;
  const pairs: Array<[HumanoidJointId, HumanoidJointId]> = [
    ['clavicle_l', 'clavicle_r'], ['upperarm_l', 'upperarm_r'], ['lowerarm_l', 'lowerarm_r'], ['hand_l', 'hand_r'],
    ['thigh_l', 'thigh_r'], ['calf_l', 'calf_r'], ['foot_l', 'foot_r'],
  ];
  for (const [left, right] of pairs) {
    const l = source.fk[left]; const r = source.fk[right];
    if (r) result.fk[left] = mirrorRotation(r)!; else delete result.fk[left];
    if (l) result.fk[right] = mirrorRotation(l)!; else delete result.fk[right];
  }
  for (const joint of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'] as HumanoidJointId[]) {
    if (source.fk[joint]) result.fk[joint] = mirrorRotation(source.fk[joint])!;
  }
  const mirrorPoint = (value?: RigVec3) => value ? { x: -value.x, y: value.y, z: value.z } : undefined;
  const swapLimb = (left: IkLimbId, right: IkLimbId) => {
    const l = source.ik[left], r = source.ik[right];
    result.ik[left] = { ...structuredClone(r), target: mirrorPoint(r.target), pole: mirrorPoint(r.pole), lockedWorldTarget: mirrorPoint(r.lockedWorldTarget) };
    result.ik[right] = { ...structuredClone(l), target: mirrorPoint(l.target), pole: mirrorPoint(l.pole), lockedWorldTarget: mirrorPoint(l.lockedWorldTarget) };
  };
  swapLimb('leftHand', 'rightHand');
  swapLimb('leftFoot', 'rightFoot');
  if (source.headLookAt.target) result.headLookAt.target = mirrorPoint(source.headLookAt.target);
  return result;
}
