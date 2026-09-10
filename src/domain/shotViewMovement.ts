import type { DirectorProject, Transform, Vec3 } from './model';
import { snapTimeToFrame } from '../editorial/timelineEngine';
import { fitAspectRect, focalLengthToVerticalFovDeg } from '../utils/math';

export type ShotMoveCamera = {
  position: Vec3;
  target: Vec3;
  focalLengthMm: number;
  sensorWidthMm: number;
};

export type ViewportPoint = { x: number; y: number };
export type ViewportSize = { width: number; height: number };

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function multiply(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Vec3): Vec3 | undefined {
  const magnitude = length(v);
  if (magnitude <= 1e-9) return undefined;
  return multiply(v, 1 / magnitude);
}

export function shotViewPointerGroundPoint(
  point: ViewportPoint,
  viewport: ViewportSize,
  frameAspect: number,
  camera: ShotMoveCamera,
  groundY: number,
): Vec3 | undefined {
  const frame = fitAspectRect(viewport.width, viewport.height, frameAspect);
  if (point.x < frame.x || point.x > frame.x + frame.width || point.y < frame.y || point.y > frame.y + frame.height) return undefined;

  const forward = normalize(subtract(camera.target, camera.position));
  if (!forward) return undefined;
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, worldUp));
  if (!right) return undefined;
  const up = normalize(cross(right, forward));
  if (!up) return undefined;

  const ndcX = ((point.x - frame.x) / frame.width) * 2 - 1;
  const ndcY = 1 - ((point.y - frame.y) / frame.height) * 2;
  const verticalFovRad = focalLengthToVerticalFovDeg(camera.focalLengthMm, camera.sensorWidthMm, frameAspect) * Math.PI / 180;
  const tanHalfY = Math.tan(verticalFovRad / 2);
  const ray = normalize(add(add(forward, multiply(right, ndcX * tanHalfY * frameAspect)), multiply(up, ndcY * tanHalfY)));
  if (!ray || Math.abs(ray.y) <= 1e-7) return undefined;

  const distance = (groundY - camera.position.y) / ray.y;
  if (distance <= 0) return undefined;
  return add(camera.position, multiply(ray, distance));
}

export function translateTransformOnGround(base: Transform, from: Vec3, to: Vec3): Transform {
  return {
    position: {
      x: base.position.x + (to.x - from.x),
      y: base.position.y,
      z: base.position.z + (to.z - from.z),
    },
    rotation: { ...base.rotation },
    scale: { ...base.scale },
  };
}

export function previewActorTransform(
  project: DirectorProject,
  sequenceId: string,
  shotId: string,
  actorId: string,
  playhead: number,
  transform: Transform,
): DirectorProject {
  const clone = structuredClone(project);
  const shot = clone.sequences.find((sequence) => sequence.id === sequenceId)?.shots.find((item) => item.id === shotId);
  const actor = shot?.actors.find((item) => item.id === actorId);
  if (!shot || !actor) return clone;

  if (actor.path.length > 0) {
    const snapped = snapTimeToFrame(playhead, shot.duration, shot.fps);
    const tolerance = 0.5 / shot.fps;
    const existing = actor.path.find((frame) => Math.abs(frame.time - snapped) <= tolerance);
    const frame = {
      time: snapped,
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      easing: existing?.easing ?? 'ease-in-out' as const,
    };
    if (existing) Object.assign(existing, frame);
    else actor.path.push(frame);
    actor.path.sort((a, b) => a.time - b.time);
    actor.transform.scale = { ...transform.scale };
  } else {
    actor.transform = {
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      scale: { ...transform.scale },
    };
  }
  return clone;
}
