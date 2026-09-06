import { z } from 'zod';

export const pipelineColorSchema = z.object({
  ocioVersion: z.literal('2.5').default('2.5'),
  ocioConfigUri: z.string().min(1).default('ocio://studio/config.ocio'),
  ocioConfigHashSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  acesVersion: z.literal('2.0').default('2.0'),
  workingSpace: z.string().min(1).default('ACEScg'),
  interchangeSpace: z.string().min(1).default('ACES2065-1'),
  display: z.string().min(1).default('sRGB - Display'),
  view: z.string().min(1).default('ACES 2.0 - SDR 100 nits'),
});
export type PipelineColorConfig = z.infer<typeof pipelineColorSchema>;

export const mediaProxyPolicySchema = z.object({
  enabled: z.boolean().default(true),
  maxWidth: z.number().int().min(320).max(8192).default(1920),
  maxHeight: z.number().int().min(180).max(8192).default(1080),
  videoCodec: z.enum(['h264', 'hevc', 'av1']).default('h264'),
  targetBitrateMbps: z.number().positive().max(100).default(8),
  audioCodec: z.enum(['aac', 'pcm']).default('aac'),
  audioSampleRate: z.number().int().min(8000).max(192000).default(48000),
}).default({ enabled: true, maxWidth: 1920, maxHeight: 1080, videoCodec: 'h264', targetBitrateMbps: 8, audioCodec: 'aac', audioSampleRate: 48000 });
export type MediaProxyPolicy = z.infer<typeof mediaProxyPolicySchema>;

export const pipelineConfigSchema = z.object({
  usdTarget: z.literal('OpenUSD-26.08').default('OpenUSD-26.08'),
  materialXVersion: z.literal('1.39').default('1.39'),
  materialXLibraryRelease: z.literal('1.39.5').default('1.39.5'),
  color: pipelineColorSchema.default({ ocioVersion: '2.5', ocioConfigUri: 'ocio://studio/config.ocio', acesVersion: '2.0', workingSpace: 'ACEScg', interchangeSpace: 'ACES2065-1', display: 'sRGB - Display', view: 'ACES 2.0 - SDR 100 nits' }),
  storageRootUri: z.string().min(1).default('pds://project'),
  proxy: mediaProxyPolicySchema,
  dccTargets: z.array(z.enum(['blender', 'maya', 'houdini', 'unreal', 'nuke', 'resolve'])).default(['blender', 'maya', 'houdini', 'unreal', 'nuke', 'resolve']),
}).default({
  usdTarget: 'OpenUSD-26.08',
  materialXVersion: '1.39',
  materialXLibraryRelease: '1.39.5',
  color: { ocioVersion: '2.5', ocioConfigUri: 'ocio://studio/config.ocio', acesVersion: '2.0', workingSpace: 'ACEScg', interchangeSpace: 'ACES2065-1', display: 'sRGB - Display', view: 'ACES 2.0 - SDR 100 nits' },
  storageRootUri: 'pds://project',
  proxy: { enabled: true, maxWidth: 1920, maxHeight: 1080, videoCodec: 'h264', targetBitrateMbps: 8, audioCodec: 'aac', audioSampleRate: 48000 },
  dccTargets: ['blender', 'maya', 'houdini', 'unreal', 'nuke', 'resolve'],
});
export type PipelineConfig = z.infer<typeof pipelineConfigSchema>;
