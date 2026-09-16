import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { cameraArrowTranslation, cameraBasis, cameraPanFromPointerDelta, previewCameraPose, translateCameraPose } from '../domain/cameraNavigation';

describe('shot camera navigation', () => {
  it('translates position and target together without changing viewing direction', () => {
    const position = { x: 0, y: 1, z: 5 };
    const target = { x: 0, y: 1, z: 0 };
    const moved = translateCameraPose(position, target, { right: 2, forward: 1 });
    expect(moved.position).toEqual({ x: 2, y: 1, z: 4 });
    expect(moved.target).toEqual({ x: 2, y: 1, z: -1 });
    expect(cameraBasis(moved.position, moved.target).forward).toEqual(cameraBasis(position, target).forward);
  });

  it('maps arrow keys to truck and dolly motion', () => {
    const camera = { position: { x: 0, y: 1, z: 5 }, target: { x: 0, y: 1, z: 0 } };
    expect(cameraArrowTranslation(camera, 'ArrowRight', 0.5)?.position.x).toBeCloseTo(0.5);
    expect(cameraArrowTranslation(camera, 'ArrowUp', 0.5)?.position.z).toBeCloseTo(4.5);
    expect(cameraArrowTranslation(camera, 'x', 0.5)).toBeUndefined();
  });

  it('converts pointer movement into image-plane camera translation', () => {
    const camera = { position: { x: 0, y: 1, z: 5 }, target: { x: 0, y: 1, z: 0 } };
    const moved = cameraPanFromPointerDelta(camera, 100, -50, 500, 60);
    expect(moved.position.x).toBeGreaterThan(0);
    expect(moved.position.y).toBeGreaterThan(1);
    expect(moved.position.z).toBeCloseTo(5);
    expect(moved.target.z).toBeCloseTo(0);
  });

  it('previews camera path edits at the current frame without mutating the source project', () => {
    const project = createDefaultProject();
    const sequence = project.sequences[0];
    const shot = sequence.shots[0];
    const original = structuredClone(shot.camera);
    const pose = { position: { x: 4, y: 2, z: 3 }, target: { x: 0, y: 1, z: 0 } };
    const preview = previewCameraPose(project, sequence.id, shot.id, 0, pose);
    const previewShot = preview.sequences[0].shots[0];
    expect(project.sequences[0].shots[0].camera).toEqual(original);
    if (previewShot.camera.path.length > 0) expect(previewShot.camera.path[0].position).toEqual(pose.position);
    else expect(previewShot.camera.position).toEqual(pose.position);
  });
});
