import type { DirectorProject } from './model';
import { lightingPresets } from './presets';
import { createActorFromPreset } from './actorLibrary';

export const createDefaultProject = (): DirectorProject => ({
  schemaVersion: 'pds-1',
  id: 'project-demo',
  name: 'Professional Director Station — Demo',
  coordinateConvention: { handedness: 'right', upAxis: 'Y', forwardAxis: '-Z', linearUnit: 'meter' },
  assets: [],
  updatedAt: new Date().toISOString(),
  sequences: [{
    id: 'seq-001',
    name: 'SEQ 001',
    shots: [{
      id: 'shot-001',
      name: 'SHOT 001A — 双人对话',
      status: 'WIP',
      version: 1,
      duration: 8,
      fps: 24,
      script: 'A 与 B 对话。演示站位、焦段、轴线和灯光。',
      actors: [
        { ...createActorFromPreset('man-adult', 1, -1.3, 0), id: 'actor-a', name: '角色 A · 成年男', transform: { position: { x: -1.3, y: 0, z: 0 }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, lookAt: { x: 1.3, y: 1.53, z: 0 } },
        { ...createActorFromPreset('woman-adult', 1, 1.3, 0), id: 'actor-b', name: '角色 B · 成年女', transform: { position: { x: 1.3, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, lookAt: { x: -1.3, y: 1.64, z: 0 } },
      ],
      camera: { id: 'cam-1', name: 'A Cam', position: { x: 0, y: 1.55, z: 5.8 }, target: { x: 0, y: 1.35, z: 0 }, focalLengthMm: 50, sensorWidthMm: 36, aperture: 2.8, focusDistanceM: 5.8, path: [] },
      lights: lightingPresets.neutral.lights,
      audio: [],
      notes: [],
    }],
  }],
});
