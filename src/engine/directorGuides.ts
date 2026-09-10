import * as THREE from 'three';
import type { Shot, Vec3 } from '../domain/model';
import { sampleActorTransform, sampleCamera } from '../utils/animation';

export const directorGuideIds = [
  'grid',
  'world-axes',
  'camera-frustum',
  'camera-axis',
  'actor-height',
  'axis-180',
  'look-lines',
  'motion-paths',
] as const;

export type DirectorGuideId = typeof directorGuideIds[number];
export type DirectorGuideVisibility = Record<DirectorGuideId, boolean>;

export const directorGuideDefinitions: Array<{ id: DirectorGuideId; label: string; title: string }> = [
  { id: 'grid', label: '网格', title: '舞台米制地面网格' },
  { id: 'world-axes', label: '世界轴', title: '世界坐标 XYZ 结构轴' },
  { id: 'camera-frustum', label: '机位视锥', title: '摄影机视锥辅助线，可独立隐藏' },
  { id: 'camera-axis', label: '摄影轴', title: '摄影机位置到镜头目标的光轴线' },
  { id: 'actor-height', label: '人物高度', title: '每个人物的真实米制高度结构线' },
  { id: 'axis-180', label: '180°轴线', title: '前两位人物之间的表演轴线，用于检查越轴' },
  { id: 'look-lines', label: '视线', title: '人物眼位到 LookAt 目标的视线' },
  { id: 'motion-paths', label: '运动轨迹', title: '人物与摄影机关键帧运动路径' },
];

export const defaultDirectorGuideVisibility: DirectorGuideVisibility = {
  grid: true,
  'world-axes': false,
  'camera-frustum': true,
  'camera-axis': true,
  'actor-height': false,
  'axis-180': true,
  'look-lines': false,
  'motion-paths': true,
};

function line(points: Vec3[], color: string, opacity = 0.8) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });
  const object = new THREE.Line(geometry, material);
  object.renderOrder = 25;
  return object;
}

function groupFor(id: DirectorGuideId) {
  const group = new THREE.Group();
  group.name = `导演辅助线 · ${id}`;
  group.userData.directorGuideId = id;
  return group;
}

function actorEyePoint(shot: Shot, actorIndex: number, time: number): Vec3 {
  const actor = shot.actors[actorIndex];
  const transform = sampleActorTransform(actor, time);
  return {
    x: transform.position.x,
    y: transform.position.y + actor.eyeHeight * transform.scale.y,
    z: transform.position.z,
  };
}

function buildCameraAxis(shot: Shot, time: number) {
  const group = groupFor('camera-axis');
  const camera = sampleCamera(shot.camera, time);
  group.add(line([camera.position, camera.target], '#6fd7ff', 0.8));
  return group;
}

function buildActorHeights(shot: Shot, time: number) {
  const group = groupFor('actor-height');
  for (const actor of shot.actors) {
    const transform = sampleActorTransform(actor, time);
    const base = { x: transform.position.x, y: transform.position.y + 0.01, z: transform.position.z };
    const top = { x: base.x, y: transform.position.y + actor.demographics.heightM * transform.scale.y, z: base.z };
    group.add(line([base, top], '#f2c86b', 0.82));
    const cap = Math.max(0.08, actor.demographics.shoulderWidthM * 0.22);
    group.add(line([{ x: top.x - cap, y: top.y, z: top.z }, { x: top.x + cap, y: top.y, z: top.z }], '#f2c86b', 0.82));
  }
  return group;
}

function buildAxis180(shot: Shot, time: number) {
  const group = groupFor('axis-180');
  if (shot.actors.length < 2) return group;
  const a = sampleActorTransform(shot.actors[0], time).position;
  const b = sampleActorTransform(shot.actors[1], time).position;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-5) return group;
  const ux = dx / length;
  const uz = dz / length;
  const extension = Math.max(3, length * 1.6);
  const y = Math.max(a.y, b.y) + 0.025;
  group.add(line([
    { x: a.x - ux * extension, y, z: a.z - uz * extension },
    { x: b.x + ux * extension, y, z: b.z + uz * extension },
  ], '#ff8d6b', 0.78));
  return group;
}

function buildLookLines(shot: Shot, time: number) {
  const group = groupFor('look-lines');
  shot.actors.forEach((actor, index) => {
    if (!actor.lookAt) return;
    group.add(line([actorEyePoint(shot, index, time), actor.lookAt], '#9ce69c', 0.68));
  });
  return group;
}

function buildMotionPaths(shot: Shot) {
  const group = groupFor('motion-paths');
  for (const actor of shot.actors) {
    if (actor.path.length < 2) continue;
    group.add(line(actor.path.map((frame) => frame.position), '#c8a8ff', 0.72));
  }
  if (shot.camera.path.length >= 2) group.add(line(shot.camera.path.map((frame) => frame.position), '#69bfff', 0.72));
  return group;
}

export function buildDirectorStructureGuides(shot: Shot, time: number): Map<DirectorGuideId, THREE.Group> {
  return new Map<DirectorGuideId, THREE.Group>([
    ['camera-axis', buildCameraAxis(shot, time)],
    ['actor-height', buildActorHeights(shot, time)],
    ['axis-180', buildAxis180(shot, time)],
    ['look-lines', buildLookLines(shot, time)],
    ['motion-paths', buildMotionPaths(shot)],
  ]);
}

export function disposeDirectorStructureGuide(group: THREE.Object3D) {
  group.traverse((object) => {
    const lineObject = object as THREE.Line;
    lineObject.geometry?.dispose?.();
    const material = lineObject.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}
