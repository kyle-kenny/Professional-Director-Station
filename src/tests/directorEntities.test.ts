import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultProject } from '../domain/defaultProject';
import { posePresetList } from '../domain/poseLibrary';
import { presetRigForActor } from '../characters/rigRuntime';
import {
  buildCameraEntity,
  buildLightEntity,
  cameraKeyframeSelectionId,
  parseCameraKeyframeSelectionId,
  resolveSceneEntityData,
  targetFromMinusZEntity,
} from '../engine/sceneEntities';

describe('3D 导演台实体化对象与姿势库', () => {
  const project = createDefaultProject();
  const shot = project.sequences[0].shots[0];

  it('内置至少三十组导演常用姿势并覆盖行走跑步坐蹲跳跃与拉弓', () => {
    expect(posePresetList.length).toBeGreaterThanOrEqual(30);
    const ids = posePresetList.map((pose) => pose.id);
    for (const id of ['walk-stride', 'stroll', 'run-stride', 'seated', 'deep-squat', 'stand-up', 'jump-air', 'archery-ready', 'archery-draw', 'archery-release']) {
      expect(ids).toContain(id);
    }
  });

  it('拉弓满弦会驱动完整 Humanoid 手臂链而非只有上臂', () => {
    const actor = structuredClone(shot.actors[0]);
    actor.pose = 'archery-draw';
    const rig = presetRigForActor(actor);
    expect(rig.fk.upperarm_l).toBeDefined();
    expect(rig.fk.upperarm_r).toBeDefined();
    expect(rig.fk.lowerarm_r).toBeDefined();
    expect(rig.fk.hand_r).toBeDefined();
  });

  it('摄影机实体及其子网格都能解析为可拾取摄影机对象', () => {
    const entity = buildCameraEntity({ id: shot.camera.id, name: shot.camera.name });
    const mesh = entity.children.find((child) => child instanceof THREE.Mesh);
    expect(resolveSceneEntityData(entity).cameraId).toBe(shot.camera.id);
    expect(resolveSceneEntityData(mesh).cameraId).toBe(shot.camera.id);
  });

  it('所有灯型都有实体器材并可从子网格解析灯具 id', () => {
    const types = ['directional', 'point', 'spot', 'area', 'ambient'] as const;
    for (const type of types) {
      const light = { ...structuredClone(shot.lights[0]), id: `light-${type}`, type, target: type === 'point' || type === 'ambient' ? undefined : { x: 0, y: 1, z: 0 } };
      const entity = buildLightEntity(light, new THREE.Color('#ffffff'));
      const mesh = entity.children.find((child) => child instanceof THREE.Mesh);
      expect(resolveSceneEntityData(entity).lightId).toBe(light.id);
      expect(resolveSceneEntityData(mesh).lightId).toBe(light.id);
    }
  });

  it('旋转后的实体使用局部 -Z 计算摄影机/灯具目标方向', () => {
    const entity = new THREE.Group();
    entity.position.set(1, 2, 3);
    entity.rotation.y = Math.PI / 2;
    const target = targetFromMinusZEntity(entity, 2);
    expect(target.x).toBeCloseTo(-1, 5);
    expect(target.y).toBeCloseTo(2, 5);
    expect(target.z).toBeCloseTo(3, 5);
  });

  it('摄影机机位 selection id 可无损往返到时间', () => {
    const id = cameraKeyframeSelectionId(1.25);
    expect(id).toBe('camera-keyframe:1.250000');
    expect(parseCameraKeyframeSelectionId(id)).toBeCloseTo(1.25, 8);
  });
});
