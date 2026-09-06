import type { Actor, ActorKeyframe, Vec3 } from './model';

export type MotionPresetId = 'walk-forward' | 'retreat' | 'cross-left' | 'cross-right';

export const motionPresetList: { id: MotionPresetId; label: string; distanceM: number }[] = [
  { id: 'walk-forward', label: '向前走', distanceM: 2.0 },
  { id: 'retreat', label: '后退', distanceM: 1.5 },
  { id: 'cross-left', label: '横移左', distanceM: 2.0 },
  { id: 'cross-right', label: '横移右', distanceM: 2.0 },
];

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => ({ x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale });

function localAxes(actor: Actor) {
  const yaw = actor.transform.rotation.y;
  const forward = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  return { forward, right };
}

export function createActorMotionPath(actor: Actor, duration: number, id: MotionPresetId): ActorKeyframe[] {
  const { forward, right } = localAxes(actor);
  const preset = motionPresetList.find((item) => item.id === id)!;
  const direction = id === 'walk-forward' || id === 'retreat' ? forward : right;
  const sign = id === 'retreat' || id === 'cross-left' ? -1 : 1;
  const start = { ...actor.transform.position };
  const end = add(start, direction, preset.distanceM * sign);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 };
  const endTime = Math.max(Number.EPSILON, duration);
  return [
    { time: 0, position: start, rotation: { ...actor.transform.rotation }, easing: 'ease-in-out' },
    { time: endTime / 2, position: mid, rotation: { ...actor.transform.rotation }, easing: 'linear' },
    { time: endTime, position: end, rotation: { ...actor.transform.rotation }, easing: 'ease-in-out' },
  ];
}
