import type { Actor } from './model';

export type ActorPresetId =
  | 'boy-child'
  | 'girl-child'
  | 'boy-teen'
  | 'girl-teen'
  | 'man-adult'
  | 'woman-adult'
  | 'man-elderly'
  | 'woman-elderly';

export type ActorPreset = {
  id: ActorPresetId;
  label: string;
  sex: 'male' | 'female';
  ageGroup: 'child' | 'teen' | 'adult' | 'elderly';
  ageYears: number;
  heightM: number;
  eyeHeightM: number;
  shoulderWidthM: number;
  bodyDepthM: number;
  headRadiusM: number;
  posture: 'upright' | 'relaxed' | 'elderly';
};

export const actorPresets: Record<ActorPresetId, ActorPreset> = {
  'boy-child': { id: 'boy-child', label: '男童 · 8岁', sex: 'male', ageGroup: 'child', ageYears: 8, heightM: 1.28, eyeHeightM: 1.16, shoulderWidthM: 0.31, bodyDepthM: 0.22, headRadiusM: 0.16, posture: 'upright' },
  'girl-child': { id: 'girl-child', label: '女童 · 8岁', sex: 'female', ageGroup: 'child', ageYears: 8, heightM: 1.25, eyeHeightM: 1.13, shoulderWidthM: 0.30, bodyDepthM: 0.21, headRadiusM: 0.16, posture: 'upright' },
  'boy-teen': { id: 'boy-teen', label: '少年 · 15岁', sex: 'male', ageGroup: 'teen', ageYears: 15, heightM: 1.68, eyeHeightM: 1.56, shoulderWidthM: 0.39, bodyDepthM: 0.25, headRadiusM: 0.18, posture: 'upright' },
  'girl-teen': { id: 'girl-teen', label: '少女 · 15岁', sex: 'female', ageGroup: 'teen', ageYears: 15, heightM: 1.61, eyeHeightM: 1.49, shoulderWidthM: 0.36, bodyDepthM: 0.24, headRadiusM: 0.175, posture: 'upright' },
  'man-adult': { id: 'man-adult', label: '成年男 · 30岁', sex: 'male', ageGroup: 'adult', ageYears: 30, heightM: 1.76, eyeHeightM: 1.64, shoulderWidthM: 0.46, bodyDepthM: 0.28, headRadiusM: 0.19, posture: 'upright' },
  'woman-adult': { id: 'woman-adult', label: '成年女 · 30岁', sex: 'female', ageGroup: 'adult', ageYears: 30, heightM: 1.65, eyeHeightM: 1.53, shoulderWidthM: 0.40, bodyDepthM: 0.26, headRadiusM: 0.185, posture: 'upright' },
  'man-elderly': { id: 'man-elderly', label: '老年男 · 72岁', sex: 'male', ageGroup: 'elderly', ageYears: 72, heightM: 1.69, eyeHeightM: 1.54, shoulderWidthM: 0.43, bodyDepthM: 0.28, headRadiusM: 0.19, posture: 'elderly' },
  'woman-elderly': { id: 'woman-elderly', label: '老年女 · 72岁', sex: 'female', ageGroup: 'elderly', ageYears: 72, heightM: 1.58, eyeHeightM: 1.43, shoulderWidthM: 0.38, bodyDepthM: 0.26, headRadiusM: 0.185, posture: 'elderly' },
};

export function createActorFromPreset(presetId: ActorPresetId, index: number, x = 0, z = 0): Actor {
  const p = actorPresets[presetId];
  return {
    id: `actor-${presetId}-${crypto.randomUUID()}`,
    name: `${p.label} ${index}`,
    demographics: {
      sex: p.sex,
      ageGroup: p.ageGroup,
      ageYears: p.ageYears,
      heightM: p.heightM,
      shoulderWidthM: p.shoulderWidthM,
      bodyDepthM: p.bodyDepthM,
      headRadiusM: p.headRadiusM,
      posture: p.posture,
    },
    transform: {
      position: { x, y: 0, z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    eyeHeight: p.eyeHeightM,
    pose: 'neutral-standing',
    action: 'idle',
    path: [],
  };
}

export const actorPresetList = Object.values(actorPresets);
