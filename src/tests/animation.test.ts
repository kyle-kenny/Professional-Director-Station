import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { createCameraRigPath } from '../domain/cameraRigs';
import { projectSchema } from '../domain/model';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';

const distanceXZ = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('deterministic director animation', () => {
  it('samples actor keyframes with deterministic interpolation', () => {
    const actor = createDefaultProject().sequences[0].shots[0].actors[0];
    actor.path = [
      { time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, easing: 'linear' },
      { time: 2, position: { x: 4, y: 0, z: -2 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, easing: 'linear' },
    ];
    const sample = sampleActorTransform(actor, 1);
    expect(sample.position).toEqual({ x: 2, y: 0, z: -1 });
    expect(sample.rotation.y).toBeCloseTo(Math.PI / 4, 6);
  });

  it('samples camera position, target and focal length from one timeline', () => {
    const camera = createDefaultProject().sequences[0].shots[0].camera;
    camera.path = [
      { time: 0, position: { x: 0, y: 1, z: 6 }, target: { x: 0, y: 1, z: 0 }, focalLengthMm: 35, easing: 'linear' },
      { time: 4, position: { x: 2, y: 3, z: 4 }, target: { x: 1, y: 1, z: 0 }, focalLengthMm: 85, easing: 'linear' },
    ];
    const sample = sampleCamera(camera, 2);
    expect(sample.position).toEqual({ x: 1, y: 2, z: 5 });
    expect(sample.target).toEqual({ x: 0.5, y: 1, z: 0 });
    expect(sample.focalLengthMm).toBe(60);
  });

  it('samples light position, target, intensity and color temperature', () => {
    const light = createDefaultProject().sequences[0].shots[0].lights[1];
    light.path = [
      { time: 0, position: { x: 0, y: 2, z: 4 }, target: { x: 0, y: 1, z: 0 }, intensity: 2, colorTemperatureK: 3200, easing: 'linear' },
      { time: 2, position: { x: 4, y: 6, z: 0 }, target: { x: 2, y: 1, z: 0 }, intensity: 6, colorTemperatureK: 5600, easing: 'linear' },
    ];
    const sample = sampleLight(light, 1);
    expect(sample.position).toEqual({ x: 2, y: 4, z: 2 });
    expect(sample.target).toEqual({ x: 1, y: 1, z: 0 });
    expect(sample.intensity).toBe(4);
    expect(sample.colorTemperatureK).toBe(4400);
  });

  it('keeps legacy path data parseable with default easing and light tracks', () => {
    const project = createDefaultProject();
    const actor = project.sequences[0].shots[0].actors[0];
    actor.path = [{ time: 1, position: { x: 1, y: 0, z: 0 }, easing: 'ease-in-out' }];
    const legacy = JSON.parse(JSON.stringify(project));
    delete legacy.sequences[0].shots[0].actors[0].path[0].easing;
    delete legacy.sequences[0].shots[0].lights[0].path;
    const parsed = projectSchema.parse(legacy);
    expect(parsed.sequences[0].shots[0].actors[0].path[0].easing).toBe('ease-in-out');
    expect(parsed.sequences[0].shots[0].lights[0].path).toEqual([]);
  });

  it('builds director camera rigs with stable geometry', () => {
    const shot = createDefaultProject().sequences[0].shots[0];
    const dolly = createCameraRigPath(shot.camera, shot.duration, 'dolly-in');
    expect(dolly).toHaveLength(2);
    expect(distanceXZ(dolly[1].position, shot.camera.target)).toBeLessThan(distanceXZ(dolly[0].position, shot.camera.target));

    const orbit = createCameraRigPath(shot.camera, shot.duration, 'orbit-right');
    expect(distanceXZ(orbit[1].position, shot.camera.target)).toBeCloseTo(distanceXZ(orbit[0].position, shot.camera.target), 6);
    expect(orbit[1].target).toEqual(orbit[0].target);
  });
});
