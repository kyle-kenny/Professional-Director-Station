import * as THREE from 'three';
import type { ShotCamera, Vec3 } from '../domain/model';

export function focalLengthToVerticalFovDeg(focalLengthMm: number, sensorWidthMm: number, aspect = 16 / 9): number {
  const sensorHeight = sensorWidthMm / aspect;
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorHeight / (2 * focalLengthMm)));
}

export function projectWorldToFrame(point: Vec3, camera: ShotCamera, aspect = 16 / 9): { x: number; y: number; visible: boolean } {
  const cam = new THREE.PerspectiveCamera(focalLengthToVerticalFovDeg(camera.focalLengthMm, camera.sensorWidthMm, aspect), aspect, 0.01, 2000);
  cam.position.set(camera.position.x, camera.position.y, camera.position.z);
  cam.lookAt(camera.target.x, camera.target.y, camera.target.z);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const p = new THREE.Vector3(point.x, point.y, point.z).project(cam);
  return { x: (p.x + 1) / 2, y: (1 - p.y) / 2, visible: p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1.25 && Math.abs(p.y) <= 1.25 };
}

export const round = (n: number, digits = 2) => Number(n.toFixed(digits));
