import { z } from 'zod';
import { projectCollaborationStateSchema } from './collaboration';
import { pipelineConfigSchema } from './pipeline';
import { aiProductionStateSchema } from './ai';
import { actorPoseKeyframeSchema, customPoseSchema, humanoidRigStateSchema } from './humanoidRig';
export type { ActorPoseKeyframe, CustomPose, HumanoidRigState, HumanoidJointId, IkLimbId, RigControlId } from './humanoidRig';

export const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof vec3Schema>;
const positiveScaleSchema = z.object({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() });
const separatedPoints = (a: Vec3, b: Vec3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 > 1e-12;

export const transformSchema = z.object({ position: vec3Schema, rotation: vec3Schema, scale: positiveScaleSchema });
export type Transform = z.infer<typeof transformSchema>;
export const easingSchema = z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']);
export type Easing = z.infer<typeof easingSchema>;
export const actorKeyframeSchema = z.object({ time: z.number().nonnegative(), position: vec3Schema, rotation: vec3Schema.optional(), easing: easingSchema.default('ease-in-out') });
export type ActorKeyframe = z.infer<typeof actorKeyframeSchema>;
export const cameraKeyframeSchema = z.object({ time: z.number().nonnegative(), position: vec3Schema, target: vec3Schema, focalLengthMm: z.number().min(8).max(1200).optional(), easing: easingSchema.default('ease-in-out') }).refine((camera) => separatedPoints(camera.position, camera.target), { message: 'Camera keyframe position and target must not coincide.' });
export type CameraKeyframe = z.infer<typeof cameraKeyframeSchema>;
export const lightKeyframeSchema = z.object({ time: z.number().nonnegative(), position: vec3Schema, target: vec3Schema.optional(), intensity: z.number().nonnegative().optional(), colorTemperatureK: z.number().min(1000).max(20000).optional(), easing: easingSchema.default('ease-in-out') });
export type LightKeyframe = z.infer<typeof lightKeyframeSchema>;

export const assetDiagnosticSchema = z.object({ severity: z.enum(['info', 'warning', 'error']), code: z.string().min(1), message: z.string().min(1) });
export type AssetDiagnosticRecord = z.infer<typeof assetDiagnosticSchema>;
export const assetProvenanceSchema = z.object({ source: z.enum(['import', 'generated', 'external', 'derived', 'unknown']).default('unknown'), sourceUri: z.string().optional(), recordedAt: z.string().optional(), recordedBy: z.string().optional(), parentAssetId: z.string().optional() }).default({ source: 'unknown' });
export type AssetProvenance = z.infer<typeof assetProvenanceSchema>;
export const assetRefSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), category: z.enum(['character', 'environment', 'prop', 'vehicle', 'camera', 'light', 'pose', 'motion', 'audio', 'storyboard', 'video']), version: z.string().min(1), uri: z.string().min(1), license: z.string().default('unknown'), owner: z.string().default('project'), unitScaleMeters: z.number().positive().default(1), contentHashSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(), provenance: assetProvenanceSchema, sourceFormat: z.enum(['glb', 'fbx']).optional(), sourceFileName: z.string().min(1).optional(), sourceSizeBytes: z.number().int().nonnegative().optional(), sourceUnitScaleMeters: z.number().positive().optional(), diagnostics: z.array(assetDiagnosticSchema).default([]),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

export const actorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  demographics: z.object({
    sex: z.enum(['male', 'female']), ageGroup: z.enum(['child', 'teen', 'adult', 'elderly']), ageYears: z.number().int().min(1).max(120),
    heightM: z.number().min(0.5).max(2.5), shoulderWidthM: z.number().min(0.15).max(0.8), bodyDepthM: z.number().min(0.1).max(0.6), headRadiusM: z.number().min(0.08).max(0.35),
    posture: z.enum(['upright', 'relaxed', 'elderly']).default('upright'),
  }),
  transform: transformSchema,
  eyeHeight: z.number().positive().default(1.65),
  pose: z.string().default('neutral-standing'),
  action: z.string().default('idle'),
  lookAt: vec3Schema.optional(),
  path: z.array(actorKeyframeSchema).default([]),
  /** Optional for pds-1 backwards compatibility; populated as soon as the user edits the humanoid rig. */
  rig: humanoidRigStateSchema.optional(),
  posePath: z.array(actorPoseKeyframeSchema).optional(),
  asset: assetRefSchema.optional(),
});
export type Actor = z.infer<typeof actorSchema>;
export const cameraSchema = z.object({ id: z.string().min(1), name: z.string().min(1), position: vec3Schema, target: vec3Schema, focalLengthMm: z.number().min(8).max(1200), sensorWidthMm: z.number().min(1).max(200).default(36), aperture: z.number().min(0.5).max(128).default(2.8), focusDistanceM: z.number().min(0.01).max(100000).default(3), path: z.array(cameraKeyframeSchema).default([]) }).refine((camera) => separatedPoints(camera.position, camera.target), { message: 'Camera position and target must not coincide.' });
export type ShotCamera = z.infer<typeof cameraSchema>;
export const lightSchema = z.object({ id: z.string().min(1), name: z.string().min(1), type: z.enum(['directional', 'point', 'spot', 'area', 'ambient']), position: vec3Schema, target: vec3Schema.optional(), intensity: z.number().nonnegative(), colorTemperatureK: z.number().min(1000).max(20000), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), castShadow: z.boolean().default(true), path: z.array(lightKeyframeSchema).default([]) });
export type DirectorLight = z.infer<typeof lightSchema>;
export const audioClipSchema = z.object({ id: z.string().min(1), name: z.string().min(1), kind: z.enum(['dialogue', 'music', 'sfx', 'ambience']), start: z.number().nonnegative(), duration: z.number().positive(), gainDb: z.number().min(-96).max(24).default(0), uri: z.string().default(''), sourceFileName: z.string().min(1).optional(), sourceSizeBytes: z.number().int().nonnegative().optional(), mimeType: z.string().optional(), sampleRate: z.number().int().positive().optional(), channels: z.number().int().min(1).max(32).optional(), waveformKey: z.string().min(1).optional() });
export type AudioClip = z.infer<typeof audioClipSchema>;
export const timelineMarkerSchema = z.object({ id: z.string().min(1), time: z.number().nonnegative(), label: z.string().min(1), color: z.enum(['blue', 'amber', 'red', 'green', 'violet']).default('amber') });
export type TimelineMarker = z.infer<typeof timelineMarkerSchema>;
export const shotNoteSchema = z.object({ id: z.string().min(1), author: z.string().min(1), time: z.number().nonnegative(), text: z.string().min(1) });
export type ShotNote = z.infer<typeof shotNoteSchema>;
export const shotSchema = z.object({ id: z.string().min(1), name: z.string().min(1), status: z.enum(['WIP', 'REVIEW', 'APPROVED']).default('WIP'), version: z.number().int().positive().default(1), duration: z.number().positive().max(3600), fps: z.number().int().min(12).max(120), frameAspect: z.number().min(0.25).max(4).default(16 / 9), script: z.string().default(''), actors: z.array(actorSchema), camera: cameraSchema, exposureEv: z.number().min(-8).max(8).default(0), lights: z.array(lightSchema), audio: z.array(audioClipSchema), markers: z.array(timelineMarkerSchema).default([]), notes: z.array(shotNoteSchema).default([]) });
export type Shot = z.infer<typeof shotSchema>;
export const sequenceSchema = z.object({ id: z.string().min(1), name: z.string().min(1), shots: z.array(shotSchema).min(1, 'A Sequence must contain at least one Shot.') });
export type Sequence = z.infer<typeof sequenceSchema>;

export const projectSchema = z.object({
  schemaVersion: z.literal('pds-1'), id: z.string().min(1), name: z.string().min(1),
  coordinateConvention: z.object({ handedness: z.literal('right'), upAxis: z.literal('Y'), forwardAxis: z.literal('-Z'), linearUnit: z.literal('meter') }),
  sequences: z.array(sequenceSchema).min(1, 'A Project must contain at least one Sequence.'),
  assets: z.array(assetRefSchema),
  customPoses: z.array(customPoseSchema).optional(),
  collaboration: projectCollaborationStateSchema,
  pipeline: pipelineConfigSchema,
  ai: aiProductionStateSchema,
  updatedAt: z.string().min(1),
});
export type DirectorProject = z.infer<typeof projectSchema>;
export type WorkspaceMode = '3d' | 'floorplan' | 'frame' | 'timeline' | 'assets' | 'review' | 'pipeline' | 'ai';
