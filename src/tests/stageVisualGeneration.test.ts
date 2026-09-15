import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { localStructuralProfile } from '../domain/ai';
import { generateLocalStructuralStoryboard } from '../ai/generation';
import {
  buildStageVisualNegativePrompt,
  buildStageVisualPrompt,
  createStageVisualGenerationPreview,
  isStageVisualOutput,
  stageVisualOutputsForFrame,
  stageVisualVariantFromOutput,
} from '../ai/stageVisualGeneration';


describe('PDS 1.5 Stage to Visual generation', () => {
  it('builds a deterministic generation request from the authoritative Stage frame', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const shot = sequence.shots[0];
    const first = createStageVisualGenerationPreview(project, sequence.id, shot, 12, localStructuralProfile, 'lighting', 'Moody night interior.', 'No bloom.');
    const second = createStageVisualGenerationPreview(project, sequence.id, shot, 12, localStructuralProfile, 'lighting', 'Moody night interior.', 'No bloom.');

    expect(first).toEqual(second);
    expect(first.stage.frame).toBe(12);
    expect(first.visual.variant).toBe('lighting');
    expect(first.visual.filename).toContain('__visual__lighting__f000012.png');
    expect(first.request.source.frame).toBe(12);
    expect(first.request.prompt).toContain('PDS_VISUAL_TARGET=lighting');
    expect(first.request.prompt).toContain(`${first.stage.camera.focalLengthMm.toFixed(1)}mm lens`);
    expect(first.request.negativePrompt).toContain('Do not change actor count');
  });

  it('tags prompts in a machine-readable way without dropping user direction', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const shot = sequence.shots[0];
    const preview = createStageVisualGenerationPreview(project, sequence.id, shot, 0, localStructuralProfile, 'composition', 'Hold the protagonist on the left third.');
    const prompt = buildStageVisualPrompt(preview.stage, 'composition', 'Hold the protagonist on the left third.');
    const negative = buildStageVisualNegativePrompt('No extra props.');

    expect(prompt.startsWith('PDS_VISUAL_TARGET=composition;')).toBe(true);
    expect(prompt).toContain('Hold the protagonist on the left third.');
    expect(negative).toContain('No extra props.');
  });

  it('finds only generated Visuals that belong to the exact Shot frame and variant', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const shot = sequence.shots[0];
    const lightingPreview = createStageVisualGenerationPreview(project, sequence.id, shot, 4, localStructuralProfile, 'lighting', 'Lighting pass.');
    const compositionPreview = createStageVisualGenerationPreview(project, sequence.id, shot, 4, localStructuralProfile, 'composition', 'Composition pass.');
    const lighting = generateLocalStructuralStoryboard(lightingPreview.request).record;
    const composition = generateLocalStructuralStoryboard(compositionPreview.request).record;
    const unrelated = generateLocalStructuralStoryboard(createStageVisualGenerationPreview(project, sequence.id, shot, 5, localStructuralProfile, 'lighting', 'Other frame.').request).record;

    expect(stageVisualVariantFromOutput(lighting)).toBe('lighting');
    expect(isStageVisualOutput(lighting, shot.id, 4, 'lighting')).toBe(true);
    expect(isStageVisualOutput(lighting, shot.id, 4, 'composition')).toBe(false);
    expect(stageVisualOutputsForFrame([unrelated, composition, lighting], shot.id, 4)).toHaveLength(2);
    expect(stageVisualOutputsForFrame([unrelated, composition, lighting], shot.id, 4, 'lighting')).toEqual([lighting]);
  });
});
