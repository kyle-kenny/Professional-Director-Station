import type { DirectorProject, ShotCamera, Vec3 } from './model';

export type CameraPose = { position: Vec3; target: Vec3 };

type CameraTranslation = { right?: number; up?: number; forward?: number };

const length = (value: Vec3) => Math.hypot(value.x, value.y, value.z);
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (value: Vec3, factor: number): Vec3 => ({ x: value.x * factor, y: value.y * factor, z: value.z * factor });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (value: Vec3, fallback: Vec3): Vec3 => {
  const magnitude = length(value);
  return magnitude > 1e-9 ? scale(value, 1 / magnitude) : { ...fallback };
};

export function cameraBasis(position: Vec3, target: Vec3) {
  const forward = normalize(subtract(target, position), { x: 0, y: 0, z: -1 });
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 });
  const up = normalize(cross(right, forward), { x: 0, y: 1, z: 0 });
  return { forward, right, up };
}

export function translateCameraPose(position: Vec3, target: Vec3, translation: CameraTranslation): CameraPose {
  const basis = cameraBasis(position, target);
  const offset = add(
    add(scale(basis.right, translation.right ?? 0), scale(basis.up, translation.up ?? 0)),
    scale(basis.forward, translation.forward ?? 0),
  );
  return { position: add(position, offset), target: add(target, offset) };
}

export function cameraArrowTranslation(camera: Pick<ShotCamera, 'position' | 'target'>, key: string, stepM = 0.12): CameraPose | undefined {
  if (key === 'ArrowLeft') return translateCameraPose(camera.position, camera.target, { right: -stepM });
  if (key === 'ArrowRight') return translateCameraPose(camera.position, camera.target, { right: stepM });
  if (key === 'ArrowUp') return translateCameraPose(camera.position, camera.target, { forward: stepM });
  if (key === 'ArrowDown') return translateCameraPose(camera.position, camera.target, { forward: -stepM });
  return undefined;
}

export function cameraPanFromPointerDelta(camera: Pick<ShotCamera, 'position' | 'target'>, deltaX: number, deltaY: number, viewportHeightPx: number, verticalFovDeg: number): CameraPose {
  const focusDistance = Math.max(0.25, length(subtract(camera.target, camera.position)));
  const height = Math.max(1, viewportHeightPx);
  const worldPerPixel = (2 * focusDistance * Math.tan((Math.max(1, Math.min(170, verticalFovDeg)) * Math.PI / 180) / 2)) / height;
  return translateCameraPose(camera.position, camera.target, {
    right: deltaX * worldPerPixel,
    up: -deltaY * worldPerPixel,
  });
}

export function previewCameraPose(project: DirectorProject, sequenceId: string, shotId: string, playhead: number, pose: CameraPose): DirectorProject {
  const clone = structuredClone(project);
  const shot = clone.sequences.find((sequence) => sequence.id === sequenceId)?.shots.find((item) => item.id === shotId);
  if (!shot) throw new Error('找不到当前镜头。');
  if (shot.camera.path.length > 0) {
    const time = Math.round(playhead * shot.fps) / shot.fps;
    const tolerance = 0.5 / shot.fps;
    const existing = shot.camera.path.find((frame) => Math.abs(frame.time - time) <= tolerance);
    const frame = {
      time,
      position: { ...pose.position },
      target: { ...pose.target },
      focalLengthMm: existing?.focalLengthMm ?? shot.camera.focalLengthMm,
      easing: existing?.easing ?? 'ease-in-out' as const,
    };
    if (existing) Object.assign(existing, frame);
    else shot.camera.path.push(frame);
    shot.camera.path.sort((a, b) => a.time - b.time);
  } else {
    shot.camera.position = { ...pose.position };
    shot.camera.target = { ...pose.target };
  }
  return clone;
}
