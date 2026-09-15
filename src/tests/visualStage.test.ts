import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import {
  createStageArtifact,
  createVisualFixture,
  createVisualStageLinkIntent,
  formatStageArtifactFilename,
  formatVisualDeliverableFilename,
  VISUAL_STAGE_UI,
} from '../domain/visualStage';

describe('PDS Visual ↔ Stage Phase 1 contract', () => {
  it('keeps filenames and UI labels stable', () => {
    expect(formatStageArtifactFilename('shot 01', 12)).toBe('shot-01__stage__f000012.pds-stage.json');
    expect(formatVisualDeliverableFilename('shot 01', 12, 'lighting')).toBe('shot-01__visual__lighting__f000012.png');
    expect(VISUAL_STAGE_UI).toEqual({
      workspace: 'Visual ↔ Stage',
      visual: 'PDS Visual',
      stage: 'Stage',
      visualToStage: 'Visual → Stage',
      stageToVisual: 'Stage → Visual',
    });
  });

  it('produces deterministic Stage artifacts, Visual fixtures and link intents', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const shot = sequence.shots[0];
    const stageA = createStageArtifact(project.id, sequence.id, shot, 12);
    const stageB = createStageArtifact(project.id, sequence.id, shot, 12);
    expect(stageA).toEqual(stageB);

    const visualA = createVisualFixture(stageA, 'composition');
    const visualB = createVisualFixture(stageB, 'composition');
    expect(visualA).toEqual(visualB);
    expect(createVisualStageLinkIntent('visual-to-stage', visualA, stageA))
      .toEqual(createVisualStageLinkIntent('visual-to-stage', visualB, stageB));
  });

  it('refuses cross-frame links', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const stage = createStageArtifact(project.id, sequence.id, sequence.shots[0], 0);
    const visual = { ...createVisualFixture(stage, 'look'), frame: stage.frame + 1 };
    expect(() => createVisualStageLinkIntent('stage-to-visual', visual, stage))
      .toThrow('Visual and Stage references must point to the same Shot frame.');
  });
});
