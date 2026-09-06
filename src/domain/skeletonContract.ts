export type HumanoidJoint =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftShoulder' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  | 'rightShoulder' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot';

export type SkeletonMapping = Partial<Record<HumanoidJoint, string>>;

export const directorSkeletonContract = {
  id: 'pds-humanoid-1',
  handedness: 'right' as const,
  upAxis: 'Y' as const,
  forwardAxis: '-Z' as const,
  linearUnit: 'meter' as const,
  restPose: 'T-pose-or-A-pose' as const,
  requiredJoints: [
    'hips', 'spine', 'head',
    'leftUpperArm', 'rightUpperArm',
    'leftUpperLeg', 'rightUpperLeg',
  ] as const satisfies readonly HumanoidJoint[],
};

export function validateSkeletonMapping(mapping: SkeletonMapping): string[] {
  const errors: string[] = [];
  for (const joint of directorSkeletonContract.requiredJoints) {
    if (!mapping[joint]?.trim()) errors.push(`missing required joint: ${joint}`);
  }
  const assigned = Object.values(mapping).filter((name): name is string => Boolean(name?.trim()));
  if (new Set(assigned).size !== assigned.length) errors.push('one source bone cannot map to multiple director joints');
  return errors;
}
