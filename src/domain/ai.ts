import { z } from 'zod';

export const aiTaskSchema = z.enum(['script-breakdown', 'storyboard', 'video']);
export type AiTask = z.infer<typeof aiTaskSchema>;

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
export const aiModelProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.enum(['local-structural', 'pds-http']),
  endpoint: z.string().url().optional(),
  modelId: z.string().min(1),
  revision: z.string().min(1).default('1'),
  tasks: z.array(aiTaskSchema).min(1),
  defaultParameters: z.record(z.string(), scalarSchema).default({}),
  enabled: z.boolean().default(true),
});
export type AiModelProfile = z.infer<typeof aiModelProfileSchema>;

export const aiSceneCandidateSchema = z.object({
  id: z.string().min(1),
  sourceScriptHashSha256: z.string().regex(/^[0-9a-f]{64}$/),
  ordinal: z.number().int().positive(),
  heading: z.string().min(1),
  location: z.string().default('UNKNOWN'),
  timeOfDay: z.string().default('UNSPECIFIED'),
  interiorExterior: z.enum(['INT', 'EXT', 'MIXED', 'UNKNOWN']).default('UNKNOWN'),
  characters: z.array(z.string()).default([]),
  beats: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
  recommendedShotCount: z.number().int().min(1).max(100).default(1),
  createdAt: z.string(),
});
export type AiSceneCandidate = z.infer<typeof aiSceneCandidateSchema>;

export const aiModelProfileSnapshotSchema = z.object({
  id: z.string(), label: z.string(), provider: z.string(), modelId: z.string(), revision: z.string(),
  parameters: z.record(z.string(), scalarSchema).default({}),
});
export type AiModelProfileSnapshot = z.infer<typeof aiModelProfileSnapshotSchema>;

export const aiGeneratedMediaSchema = z.object({
  id: z.string().min(1),
  task: z.enum(['storyboard', 'video']),
  status: z.enum(['generated', 'approved', 'rejected', 'failed']),
  sourceShotId: z.string().min(1),
  sourceShotVersion: z.number().int().positive(),
  sourceShotHashSha256: z.string().regex(/^[0-9a-f]{64}$/),
  sourceFrame: z.number().int().nonnegative().optional(),
  profile: aiModelProfileSnapshotSchema,
  prompt: z.string(),
  negativePrompt: z.string().default(''),
  promptHashSha256: z.string().regex(/^[0-9a-f]{64}$/),
  controlHashSha256: z.string().regex(/^[0-9a-f]{64}$/),
  uri: z.string().min(1).optional(),
  mimeType: z.string().optional(),
  contentHashSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  providerJobId: z.string().optional(),
  seed: z.number().int().optional(),
  generatedAt: z.string(),
  error: z.string().optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedAt: z.string().optional(),
});
export type AiGeneratedMedia = z.infer<typeof aiGeneratedMediaSchema>;

export const localStructuralProfile: AiModelProfile = {
  id: 'local-structural-v1',
  label: 'PDS Local Structural Storyboard',
  provider: 'local-structural',
  modelId: 'pds-structural-svg',
  revision: '1',
  tasks: ['script-breakdown', 'storyboard'],
  defaultParameters: { width: 1280, height: 720 },
  enabled: true,
};

export const aiProductionStateSchema = z.object({
  profiles: z.array(aiModelProfileSchema).default([localStructuralProfile]),
  sceneCandidates: z.array(aiSceneCandidateSchema).default([]),
  outputs: z.array(aiGeneratedMediaSchema).default([]),
}).default({ profiles: [localStructuralProfile], sceneCandidates: [], outputs: [] });
export type AiProductionState = z.infer<typeof aiProductionStateSchema>;
