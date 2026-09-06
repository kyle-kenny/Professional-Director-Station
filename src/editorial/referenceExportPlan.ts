import type { Shot } from '../domain/model';
import { totalFrames } from './timelineEngine';

export function buildReferenceExportPlan(shot: Shot) {
  const frames = totalFrames(shot.duration, shot.fps);
  return {
    fps: shot.fps,
    frames,
    duration: frames / shot.fps,
    timestamps: Array.from({ length: frames }, (_, frame) => frame / shot.fps),
  };
}
