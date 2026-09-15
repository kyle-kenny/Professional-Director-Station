import type { Shot, Transform, Vec3 } from './model';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';

export const VISUAL_STAGE_CONTRACT_VERSION = 'pds-visual-stage-1' as const;
export const VISUAL_DELIVERABLE_VERSION = 'pds-visual-1' as const;
export const STAGE_ARTIFACT_VERSION = 'pds-stage-1' as const;
export const VISUAL_STAGE_UI = {
  workspace: 'Visual ↔ Stage',
  visual: 'PDS Visual',
  stage: 'Stage',
  visualToStage: 'Visual → Stage',
  stageToVisual: 'Stage → Visual',
} as const;

export type VisualStageDirection = 'visual-to-stage' | 'stage-to-visual';
export type VisualFixtureVariant = 'composition' | 'lighting' | 'look';

export type VisualDeliverableRef = {
  schemaVersion: typeof VISUAL_DELIVERABLE_VERSION;
  id: string;
  shotId: string;
  frame: number;
  variant: VisualFixtureVariant;
  filename: string;
  source: 'fixture' | 'import';
};

export type StageActorSnapshot = { id: string; name: string; transform: Transform };
export type StageCameraSnapshot = {
  id: string; name: string; position: Vec3; target: Vec3; focalLengthMm: number;
  sensorWidthMm: number; aperture: number; focusDistanceM: number;
};
export type StageLightSnapshot = {
  id: string; name: string; type: Shot['lights'][number]['type']; position: Vec3; target?: Vec3;
  intensity: number; colorTemperatureK: number;
};

export type StageArtifact = {
  schemaVersion: typeof STAGE_ARTIFACT_VERSION;
  projectId: string;
  sequenceId: string;
  shotId: string;
  shotName: string;
  frame: number;
  fps: number;
  frameAspect: number;
  filename: string;
  actors: StageActorSnapshot[];
  camera: StageCameraSnapshot;
  lights: StageLightSnapshot[];
};

export type VisualStageLinkIntent = {
  schemaVersion: typeof VISUAL_STAGE_CONTRACT_VERSION;
  id: string;
  direction: VisualStageDirection;
  status: 'draft';
  visual: VisualDeliverableRef;
  stage: Pick<StageArtifact, 'projectId' | 'sequenceId' | 'shotId' | 'frame' | 'filename'>;
};

function safeStem(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'shot';
}

function normalizedFrame(frame: number): number {
  return Math.max(0, Math.round(Number.isFinite(frame) ? frame : 0));
}

export function formatFrameToken(frame: number): string {
  return String(normalizedFrame(frame)).padStart(6, '0');
}

export function formatStageArtifactFilename(shotId: string, frame: number): string {
  return `${safeStem(shotId)}__stage__f${formatFrameToken(frame)}.pds-stage.json`;
}

export function formatVisualDeliverableFilename(shotId: string, frame: number, variant: VisualFixtureVariant): string {
  return `${safeStem(shotId)}__visual__${variant}__f${formatFrameToken(frame)}.png`;
}

export function createStageArtifact(projectId: string, sequenceId: string, shot: Shot, requestedFrame: number): StageArtifact {
  const maxFrame = Math.max(0, Math.ceil(shot.duration * shot.fps) - 1);
  const frame = Math.min(normalizedFrame(requestedFrame), maxFrame);
  const time = frame / shot.fps;
  const camera = sampleCamera(shot.camera, time);
  return {
    schemaVersion: STAGE_ARTIFACT_VERSION,
    projectId,
    sequenceId,
    shotId: shot.id,
    shotName: shot.name,
    frame,
    fps: shot.fps,
    frameAspect: shot.frameAspect,
    filename: formatStageArtifactFilename(shot.id, frame),
    actors: shot.actors.map((actor) => ({ id: actor.id, name: actor.name, transform: sampleActorTransform(actor, time) })),
    camera: {
      id: shot.camera.id,
      name: shot.camera.name,
      position: { ...camera.position },
      target: { ...camera.target },
      focalLengthMm: camera.focalLengthMm,
      sensorWidthMm: shot.camera.sensorWidthMm,
      aperture: shot.camera.aperture,
      focusDistanceM: shot.camera.focusDistanceM,
    },
    lights: shot.lights.map((light) => {
      const sampled = sampleLight(light, time);
      return {
        id: light.id,
        name: light.name,
        type: light.type,
        position: { ...sampled.position },
        target: sampled.target ? { ...sampled.target } : undefined,
        intensity: sampled.intensity,
        colorTemperatureK: sampled.colorTemperatureK,
      };
    }),
  };
}

export function createVisualFixture(stage: StageArtifact, variant: VisualFixtureVariant): VisualDeliverableRef {
  return {
    schemaVersion: VISUAL_DELIVERABLE_VERSION,
    id: `${stage.shotId}:visual:${variant}:f${formatFrameToken(stage.frame)}`,
    shotId: stage.shotId,
    frame: stage.frame,
    variant,
    filename: formatVisualDeliverableFilename(stage.shotId, stage.frame, variant),
    source: 'fixture',
  };
}

export function createVisualStageLinkIntent(direction: VisualStageDirection, visual: VisualDeliverableRef, stage: StageArtifact): VisualStageLinkIntent {
  if (visual.shotId !== stage.shotId || visual.frame !== stage.frame) {
    throw new Error('Visual and Stage references must point to the same Shot frame.');
  }
  return {
    schemaVersion: VISUAL_STAGE_CONTRACT_VERSION,
    id: `${stage.shotId}:${formatFrameToken(stage.frame)}:${direction}:${visual.variant}`,
    direction,
    status: 'draft',
    visual,
    stage: {
      projectId: stage.projectId,
      sequenceId: stage.sequenceId,
      shotId: stage.shotId,
      frame: stage.frame,
      filename: stage.filename,
    },
  };
}
