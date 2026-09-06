import type { CameraKeyframe, ShotCamera, Vec3 } from './model';

export type CameraRigPresetId = 'dolly-in' | 'dolly-out' | 'crane-up' | 'crane-down' | 'orbit-left' | 'orbit-right';

export const cameraRigPresets: Record<CameraRigPresetId, { label: string; description: string }> = {
  'dolly-in': { label: 'Dolly In', description: '沿镜头-目标连线平滑推进。' },
  'dolly-out': { label: 'Dolly Out', description: '沿镜头-目标连线平滑拉远。' },
  'crane-up': { label: 'Crane Up', description: '机位垂直升高，目标保持不变。' },
  'crane-down': { label: 'Crane Down', description: '机位垂直下降，目标保持不变。' },
  'orbit-left': { label: 'Orbit Left', description: '围绕目标向左弧形运动。' },
  'orbit-right': { label: 'Orbit Right', description: '围绕目标向右弧形运动。' },
};

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: Vec3, scalar: number): Vec3 => ({ x: a.x * scalar, y: a.y * scalar, z: a.z * scalar });

function orbit(position: Vec3, target: Vec3, degrees: number): Vec3 {
  const delta = sub(position, target);
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: target.x + delta.x * cos - delta.z * sin,
    y: position.y,
    z: target.z + delta.x * sin + delta.z * cos,
  };
}

export function createCameraRigPath(camera: ShotCamera, duration: number, preset: CameraRigPresetId): CameraKeyframe[] {
  const endTime = Math.max(0.5, duration);
  const start: CameraKeyframe = {
    time: 0,
    position: { ...camera.position },
    target: { ...camera.target },
    focalLengthMm: camera.focalLengthMm,
    easing: 'ease-in-out',
  };
  let endPosition = { ...camera.position };
  let endTarget = { ...camera.target };
  const toCamera = sub(camera.position, camera.target);

  if (preset === 'dolly-in') endPosition = add(camera.target, mul(toCamera, 0.62));
  else if (preset === 'dolly-out') endPosition = add(camera.target, mul(toCamera, 1.42));
  else if (preset === 'crane-up') endPosition = { ...camera.position, y: camera.position.y + 2 };
  else if (preset === 'crane-down') endPosition = { ...camera.position, y: Math.max(0.15, camera.position.y - 1.5) };
  else if (preset === 'orbit-left') endPosition = orbit(camera.position, camera.target, -35);
  else if (preset === 'orbit-right') endPosition = orbit(camera.position, camera.target, 35);

  return [start, {
    time: endTime,
    position: endPosition,
    target: endTarget,
    focalLengthMm: camera.focalLengthMm,
    easing: 'ease-in-out',
  }];
}
