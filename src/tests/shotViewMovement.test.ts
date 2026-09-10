import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { previewActorTransform, shotViewPointerGroundPoint, translateTransformOnGround } from '../domain/shotViewMovement';
import { sampleActorTransform } from '../utils/animation';

const camera = {
  position: { x: 0, y: 2, z: 5 },
  target: { x: 0, y: 0, z: 0 },
  focalLengthMm: 50,
  sensorWidthMm: 36,
};

describe('shot-view actor movement', () => {
  it('projects the center of a 16:9 shot onto the camera target ground point', () => {
    const point = shotViewPointerGroundPoint(
      { x: 800, y: 450 },
      { width: 1600, height: 900 },
      16 / 9,
      camera,
      0,
    );
    expect(point).toBeDefined();
    expect(point!.x).toBeCloseTo(0, 5);
    expect(point!.y).toBeCloseTo(0, 5);
    expect(point!.z).toBeCloseTo(0, 5);
  });

  it('translates X/Z while preserving actor floor height, rotation and scale', () => {
    const base = {
      position: { x: -1, y: 0, z: 0.5 },
      rotation: { x: 0, y: 0.4, z: 0 },
      scale: { x: 1, y: 1.1, z: 1 },
    };
    const moved = translateTransformOnGround(base, { x: 0, y: 0, z: 0 }, { x: 1.25, y: 0, z: -0.75 });
    expect(moved.position).toEqual({ x: 0.25, y: 0, z: -0.25 });
    expect(moved.rotation).toEqual(base.rotation);
    expect(moved.scale).toEqual(base.scale);
  });

  it('previews an actor transform without mutating the authoritative project', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const shot = sequence.shots[0];
    const actor = shot.actors[0];
    const before = sampleActorTransform(actor, 0);
    const moved = {
      ...before,
      position: { x: before.position.x + 0.8, y: before.position.y, z: before.position.z - 0.6 },
    };
    const preview = previewActorTransform(project, sequence.id, shot.id, actor.id, 0, moved);
    const previewActor = preview.sequences[0].shots[0].actors[0];
    expect(sampleActorTransform(previewActor, 0).position.x).toBeCloseTo(moved.position.x, 6);
    expect(sampleActorTransform(previewActor, 0).position.z).toBeCloseTo(moved.position.z, 6);
    expect(sampleActorTransform(actor, 0).position).toEqual(before.position);
  });
});
