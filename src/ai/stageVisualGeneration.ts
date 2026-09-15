import type { AiGeneratedMedia, AiModelProfile } from '../domain/ai';
import type { DirectorProject, Shot } from '../domain/model';
import {
  createStageArtifact,
  createVisualFixture,
  type StageArtifact,
  type VisualDeliverableRef,
  type VisualFixtureVariant,
} from '../domain/visualStage';
import { buildGenerationRequest, type AiGenerationRequest } from './generation';

export const STAGE_VISUAL_GENERATION_VERSION = 'pds-stage-visual-generation-1' as const;
const PROMPT_PREFIX = 'PDS_VISUAL_TARGET';

const variantInstruction: Record<VisualFixtureVariant, string> = {
  composition: 'Prioritize blocking, framing, screen direction and subject placement while preserving the Stage camera.',
  lighting: 'Prioritize key/fill/rim relationships, direction, contrast and color temperature while preserving blocking and camera.',
  look: 'Prioritize final cinematic color, atmosphere, materials and finishing while preserving Stage blocking, lens and lighting intent.',
};

export type StageVisualGenerationPreview = {
  schemaVersion: typeof STAGE_VISUAL_GENERATION_VERSION;
  stage: StageArtifact;
  visual: VisualDeliverableRef;
  request: AiGenerationRequest;
};

export function buildStageVisualPrompt(stage: StageArtifact, variant: VisualFixtureVariant, userPrompt: string): string {
  const actors = stage.actors.map((actor) => actor.name).join(', ') || 'none';
  const lights = stage.lights.map((light) => `${light.name}:${light.type}:${Math.round(light.colorTemperatureK)}K`).join(', ') || 'none';
  const metadata = `${PROMPT_PREFIX}=${variant};SHOT=${stage.shotId};FRAME=${stage.frame};STAGE=${stage.filename}`;
  const constraints = `Stage facts: ${stage.actors.length} actor(s) [${actors}], ${stage.camera.focalLengthMm.toFixed(1)}mm lens, aspect ${stage.frameAspect.toFixed(3)}, ${stage.lights.length} light(s) [${lights}].`;
  const custom = userPrompt.trim();
  return [metadata, variantInstruction[variant], constraints, custom].filter(Boolean).join('\n');
}

export function buildStageVisualNegativePrompt(userNegativePrompt: string): string {
  const base = 'Do not change actor count, Stage blocking, camera axis, focal length, frame aspect, or established production facts.';
  const custom = userNegativePrompt.trim();
  return [base, custom].filter(Boolean).join(' ');
}

export function createStageVisualGenerationPreview(
  project: DirectorProject,
  sequenceId: string,
  shot: Shot,
  frame: number,
  profile: AiModelProfile,
  variant: VisualFixtureVariant,
  userPrompt: string,
  userNegativePrompt = '',
): StageVisualGenerationPreview {
  const stage = createStageArtifact(project.id, sequenceId, shot, frame);
  const visual = createVisualFixture(stage, variant);
  const prompt = buildStageVisualPrompt(stage, variant, userPrompt);
  const negativePrompt = buildStageVisualNegativePrompt(userNegativePrompt);
  const request = buildGenerationRequest(project, shot, 'storyboard', stage.frame, profile, prompt, negativePrompt);
  return { schemaVersion: STAGE_VISUAL_GENERATION_VERSION, stage, visual, request };
}

export function stageVisualVariantFromOutput(output: AiGeneratedMedia): VisualFixtureVariant | undefined {
  const match = output.prompt.match(new RegExp(`^${PROMPT_PREFIX}=(composition|lighting|look);`));
  return match?.[1] as VisualFixtureVariant | undefined;
}

export function isStageVisualOutput(output: AiGeneratedMedia, shotId: string, frame: number, variant?: VisualFixtureVariant): boolean {
  if (output.task !== 'storyboard' || output.sourceShotId !== shotId || output.sourceFrame !== frame) return false;
  const outputVariant = stageVisualVariantFromOutput(output);
  return outputVariant !== undefined && (!variant || outputVariant === variant);
}

export function stageVisualOutputsForFrame(outputs: AiGeneratedMedia[], shotId: string, frame: number, variant?: VisualFixtureVariant): AiGeneratedMedia[] {
  return outputs
    .filter((output) => isStageVisualOutput(output, shotId, frame, variant))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}
