import { z } from 'zod';

export const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof vec3Schema>;

export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});
export type Transform = z.infer<typeof transformSchema>;

export const assetRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['character', 'environment', 'prop', 'vehicle', 'camera', 'light', 'pose', 'motion', 'audio']),
  version: z.string().min(1),
  uri: z.string().min(1),
  license: z.string().default('unknown'),
  owner: z.string().default('project'),
  unitScaleMeters: z.number().positive().default(1),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

export const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  demographics: z.object({
    sex: z.enum(['male', 'female']),
    ageGroup: z.enum(['child', 'teen', 'adult', 'elderly']),
    ageYears: z.number().int().min(1).max(120),
    heightM: z.number().min(0.5).max(2.5),
    shoulderWidthM: z.number().min(0.15).max(0.8),
    bodyDepthM: z.number().min(0.1).max(0.6),
    headRadiusM: z.number().min(0.08).max(0.35),
    posture: z.enum(['upright', 'relaxed', 'elderly']).default('upright'),
  }),
  transform: transformSchema,
  eyeHeight: z.number().positive().default(1.65),
  pose: z.string().default('neutral-standing'),
  action: z.string().default('idle'),
  lookAt: vec3Schema.optional(),
  path: z.array(z.object({ time: z.number().nonnegative(), position: vec3Schema })).default([]),
  asset: assetRefSchema.optional(),
});
export type Actor = z.infer<typeof actorSchema>;

export const cameraSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: vec3Schema,
  target: vec3Schema,
  focalLengthMm: z.number().min(8).max(1200),
  sensorWidthMm: z.number().positive().default(36),
  aperture: z.number().positive().default(2.8),
  focusDistanceM: z.number().positive().default(3),
  path: z.array(z.object({ time: z.number().nonnegative(), position: vec3Schema, target: vec3Schema })).default([]),
});
export type ShotCamera = z.infer<typeof cameraSchema>;

export const lightSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['directional', 'point', 'spot', 'area', 'ambient']),
  position: vec3Schema,
  target: vec3Schema.optional(),
  intensity: z.number().nonnegative(),
  colorTemperatureK: z.number().min(1000).max(20000),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  castShadow: z.boolean().default(true),
});
export type DirectorLight = z.infer<typeof lightSchema>;

export const audioClipSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['dialogue', 'music', 'sfx', 'ambience']),
  start: z.number().nonnegative(),
  duration: z.number().positive(),
  gainDb: z.number().min(-96).max(24).default(0),
  uri: z.string().default(''),
});
export type AudioClip = z.infer<typeof audioClipSchema>;

export const shotSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['WIP', 'REVIEW', 'APPROVED']).default('WIP'),
  version: z.number().int().positive().default(1),
  duration: z.number().positive().max(3600),
  fps: z.number().int().min(12).max(120),
  script: z.string().default(''),
  actors: z.array(actorSchema),
  camera: cameraSchema,
  lights: z.array(lightSchema),
  audio: z.array(audioClipSchema),
  notes: z.array(z.object({ id: z.string(), author: z.string(), time: z.number().nonnegative(), text: z.string() })).default([]),
});
export type Shot = z.infer<typeof shotSchema>;

export const sequenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  shots: z.array(shotSchema),
});
export type Sequence = z.infer<typeof sequenceSchema>;

export const projectSchema = z.object({
  schemaVersion: z.literal('pds-1'),
  id: z.string(),
  name: z.string(),
  coordinateConvention: z.object({
    handedness: z.literal('right'),
    upAxis: z.literal('Y'),
    forwardAxis: z.literal('-Z'),
    linearUnit: z.literal('meter'),
  }),
  sequences: z.array(sequenceSchema),
  assets: z.array(assetRefSchema),
  updatedAt: z.string(),
});
export type DirectorProject = z.infer<typeof projectSchema>;

export type WorkspaceMode = '3d' | 'floorplan' | 'frame' | 'timeline';
