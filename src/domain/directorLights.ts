import type { DirectorLight, Shot, Vec3 } from './model';
import { sampleActorTransform, sampleCamera } from '../utils/animation';

export type DirectorLightToolPresetId = 'key-area' | 'fill-area' | 'rim-spot' | 'spot' | 'point' | 'sun' | 'ambient';
export type DirectorLightDirectionId = 'left' | 'top' | 'right' | 'front' | 'bottom' | 'back';

type DirectorLightToolPreset = {
  id: DirectorLightToolPresetId;
  label: string;
  shortLabel: string;
  description: string;
  type: DirectorLight['type'];
  intensity: number;
  colorTemperatureK: number;
  cameraRelativeOffset: { side: number; height: number; front: number };
};

type DirectorLightDirectionPreset = {
  id: DirectorLightDirectionId;
  label: string;
  cameraRelativeOffset: { side: number; height: number; front: number };
};

export const directorLightToolPresets: DirectorLightToolPreset[] = [
  { id: 'key-area', label: '主光 · 区域光', shortLabel: '主光', description: '摄影机左前方偏高的大面积柔光，建立自然面部塑形并保留眼神光。', type: 'area', intensity: 6.8, colorTemperatureK: 5200, cameraRelativeOffset: { side: -2.5, height: 2.8, front: 2.7 } },
  { id: 'fill-area', label: '补光 · 区域光', shortLabel: '补光', description: '摄影机右前方低强度冷柔光，只抬阴影，不与主光争方向。', type: 'area', intensity: 1.7, colorTemperatureK: 7000, cameraRelativeOffset: { side: 2.8, height: 1.9, front: 1.9 } },
  { id: 'rim-spot', label: '轮廓光 · 聚光灯', shortLabel: '轮廓', description: '人物后侧偏高聚光，用于肩线和发丝分离，强度高于补光但避开正面。', type: 'spot', intensity: 24, colorTemperatureK: 6800, cameraRelativeOffset: { side: 1.5, height: 2.9, front: -2.8 } },
  { id: 'spot', label: '聚光灯', shortLabel: '聚光', description: '可移动、可定向的硬光源，默认从四分之三前侧打向人物。', type: 'spot', intensity: 22, colorTemperatureK: 5600, cameraRelativeOffset: { side: -1.5, height: 2.6, front: 2.2 } },
  { id: 'point', label: '点光源', shortLabel: '点光', description: '全向局部光源，适合台灯、裸灯泡和实景灯。', type: 'point', intensity: 18, colorTemperatureK: 4300, cameraRelativeOffset: { side: 0.9, height: 1.9, front: 1.2 } },
  { id: 'sun', label: '平行光', shortLabel: '太阳', description: '方向一致的远距离硬光，默认高位侧前方，适合太阳或月光方向。', type: 'directional', intensity: 2.6, colorTemperatureK: 5600, cameraRelativeOffset: { side: -4, height: 5.8, front: 3.2 } },
  { id: 'ambient', label: '环境光', shortLabel: '环境', description: '低强度环境底光，只抬最低照度，避免把人物面部层次洗平。', type: 'ambient', intensity: 0.18, colorTemperatureK: 7600, cameraRelativeOffset: { side: 0, height: 3, front: 0 } },
];

export const directorLightDirectionPresets: DirectorLightDirectionPreset[] = [
  { id: 'left', label: '左', cameraRelativeOffset: { side: -3, height: 1.7, front: 0.5 } },
  { id: 'top', label: '上', cameraRelativeOffset: { side: 0, height: 4, front: 0.2 } },
  { id: 'right', label: '右', cameraRelativeOffset: { side: 3, height: 1.7, front: 0.5 } },
  { id: 'front', label: '前', cameraRelativeOffset: { side: 0, height: 1.8, front: 3 } },
  { id: 'bottom', label: '下', cameraRelativeOffset: { side: 0, height: 0.35, front: 1.5 } },
  { id: 'back', label: '后', cameraRelativeOffset: { side: 0, height: 2, front: -3 } },
];

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (v: Vec3, amount: number): Vec3 => ({ x: v.x * amount, y: v.y * amount, z: v.z * amount });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const normalize = (v: Vec3): Vec3 => {
  const length = Math.max(1e-6, Math.hypot(v.x, v.y, v.z));
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export function directorStageTarget(shot: Shot, time: number): Vec3 {
  if (shot.actors.length === 0) return { ...sampleCamera(shot.camera, time).target };
  const samples = shot.actors.map((actor) => ({ actor, transform: sampleActorTransform(actor, time) }));
  return {
    x: samples.reduce((sum, item) => sum + item.transform.position.x, 0) / samples.length,
    y: samples.reduce((sum, item) => sum + item.transform.position.y + item.actor.demographics.heightM * 0.52, 0) / samples.length,
    z: samples.reduce((sum, item) => sum + item.transform.position.z, 0) / samples.length,
  };
}

function cameraRelativePosition(shot: Shot, time: number, offset: { side: number; height: number; front: number }): { position: Vec3; target: Vec3 } {
  const camera = sampleCamera(shot.camera, time);
  const target = directorStageTarget(shot, time);
  const forward = normalize(sub(target, camera.position));
  const rightRaw = cross(forward, { x: 0, y: 1, z: 0 });
  const right = Math.hypot(rightRaw.x, rightRaw.y, rightRaw.z) < 1e-5 ? { x: 1, y: 0, z: 0 } : normalize(rightRaw);
  const towardCamera = scale(forward, -1);
  const position = add(add(add(target, scale(right, offset.side)), { x: 0, y: offset.height, z: 0 }), scale(towardCamera, offset.front));
  return { position, target };
}

export function createDirectorLightFromPreset(shot: Shot, time: number, presetId: DirectorLightToolPresetId, ordinal: number, id: string): DirectorLight {
  const preset = directorLightToolPresets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`未知灯具预设：${presetId}`);
  const { position, target } = cameraRelativePosition(shot, time, preset.cameraRelativeOffset);
  return {
    id,
    name: `${preset.shortLabel} ${ordinal}`,
    type: preset.type,
    position,
    target: preset.type === 'point' || preset.type === 'ambient' ? undefined : { ...target },
    intensity: preset.intensity,
    colorTemperatureK: preset.colorTemperatureK,
    color: '#ffffff',
    castShadow: preset.type === 'directional' || preset.type === 'point' || preset.type === 'spot',
    path: [],
  };
}

export function placeDirectorLightAtDirection(shot: Shot, time: number, light: DirectorLight, directionId: DirectorLightDirectionId): DirectorLight {
  const preset = directorLightDirectionPresets.find((item) => item.id === directionId);
  if (!preset) throw new Error(`未知打光方向：${directionId}`);
  const { position, target } = cameraRelativePosition(shot, time, preset.cameraRelativeOffset);
  const next = structuredClone(light);
  next.position = position;
  if (next.type !== 'point' && next.type !== 'ambient') next.target = { ...target };
  return next;
}
