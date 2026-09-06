import type { Shot } from '../domain/model';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';

export type FrameRounding = 'nearest' | 'floor' | 'ceil';

export function totalFrames(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}

export function frameToTime(frame: number, fps: number): number {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) throw new Error('Invalid frame/fps');
  return frame / fps;
}

export function timeToFrame(time: number, fps: number, rounding: FrameRounding = 'nearest'): number {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0) throw new Error('Invalid time/fps');
  const raw = time * fps;
  if (rounding === 'floor') return Math.floor(raw + 1e-9);
  if (rounding === 'ceil') return Math.ceil(raw - 1e-9);
  return Math.round(raw);
}

export function clampFrame(frame: number, duration: number, fps: number): number {
  return Math.min(totalFrames(duration, fps), Math.max(0, Math.round(frame)));
}

export function snapTimeToFrame(time: number, duration: number, fps: number): number {
  return frameToTime(clampFrame(timeToFrame(time, fps), duration, fps), fps);
}

export function stepFrame(frame: number, delta: number, duration: number, fps: number): number {
  return clampFrame(frame + delta, duration, fps);
}

export function frameFromElapsed(startFrame: number, elapsedMs: number, duration: number, fps: number): number {
  const advanced = Math.floor(Math.max(0, elapsedMs) * fps / 1000 + 1e-9);
  return clampFrame(startFrame + advanced, duration, fps);
}

export function buildFrameSchedule(duration: number, fps: number): number[] {
  const count = totalFrames(duration, fps);
  return Array.from({ length: count + 1 }, (_, frame) => frame);
}

export function activeAudioAtFrame(shot: Shot, frame: number) {
  const time = frameToTime(clampFrame(frame, shot.duration, shot.fps), shot.fps);
  return shot.audio.filter((clip) => time >= clip.start && time < clip.start + clip.duration);
}

export function sampleShotAtFrame(shot: Shot, frame: number) {
  const safeFrame = clampFrame(frame, shot.duration, shot.fps);
  const time = frameToTime(safeFrame, shot.fps);
  return {
    frame: safeFrame,
    time,
    camera: sampleCamera(shot.camera, time),
    actors: shot.actors.map((actor) => ({ actor, transform: sampleActorTransform(actor, time) })),
    lights: shot.lights.map((light) => sampleLight(light, time)),
    audio: activeAudioAtFrame(shot, safeFrame),
    markers: shot.markers.filter((marker) => timeToFrame(marker.time, shot.fps) === safeFrame),
    notes: shot.notes.filter((note) => timeToFrame(note.time, shot.fps) === safeFrame),
  };
}
