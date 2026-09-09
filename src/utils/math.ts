import * as THREE from 'three';
import type { ShotCamera, Vec3 } from '../domain/model';

export type CameraDepthOfField = {
  sensorHeightMm: number;
  circleOfConfusionMm: number;
  hyperfocalM: number;
  nearM: number;
  farM: number;
  validFocus: boolean;
};

export function focalLengthToHorizontalFovDeg(focalLengthMm: number, sensorWidthMm: number): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorWidthMm / (2 * focalLengthMm)));
}

export function focalLengthToVerticalFovDeg(focalLengthMm: number, sensorWidthMm: number, aspect = 16 / 9): number {
  const sensorHeight = sensorWidthMm / aspect;
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorHeight / (2 * focalLengthMm)));
}

/**
 * Circle of confusion uses a sensor-diagonal / 1500 criterion. This scales the
 * acceptable blur circle with filmback instead of assuming a fixed full-frame
 * value, while remaining close to the conventional ~0.03 mm 35 mm criterion.
 */
export function cameraDepthOfField(
  camera: Pick<ShotCamera, 'focalLengthMm' | 'sensorWidthMm' | 'aperture' | 'focusDistanceM'>,
  aspect = 16 / 9,
): CameraDepthOfField {
  const safeAspect = Math.max(0.01, aspect);
  const sensorHeightMm = camera.sensorWidthMm / safeAspect;
  const sensorDiagonalMm = Math.hypot(camera.sensorWidthMm, sensorHeightMm);
  const circleOfConfusionMm = sensorDiagonalMm / 1500;
  const focalLengthM = camera.focalLengthMm / 1000;
  const circleOfConfusionM = circleOfConfusionMm / 1000;
  const hyperfocalM = (focalLengthM * focalLengthM) / (camera.aperture * circleOfConfusionM) + focalLengthM;
  const focusDistanceM = camera.focusDistanceM;
  const validFocus = focusDistanceM > focalLengthM;

  if (!validFocus) {
    return {
      sensorHeightMm,
      circleOfConfusionMm,
      hyperfocalM,
      nearM: Number.NaN,
      farM: Number.NaN,
      validFocus: false,
    };
  }

  const nearM = (hyperfocalM * focusDistanceM) / (hyperfocalM + (focusDistanceM - focalLengthM));
  const farDenominator = hyperfocalM - (focusDistanceM - focalLengthM);
  const farM = focusDistanceM >= hyperfocalM || farDenominator <= 0
    ? Number.POSITIVE_INFINITY
    : (hyperfocalM * focusDistanceM) / farDenominator;

  return { sensorHeightMm, circleOfConfusionMm, hyperfocalM, nearM, farM, validFocus: true };
}

export function fitAspectRect(width: number, height: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeAspect = Math.max(0.01, aspect);
  if (safeWidth / safeHeight > safeAspect) {
    const fittedWidth = safeHeight * safeAspect;
    return { x: (safeWidth - fittedWidth) / 2, y: 0, width: fittedWidth, height: safeHeight };
  }
  const fittedHeight = safeWidth / safeAspect;
  return { x: 0, y: (safeHeight - fittedHeight) / 2, width: safeWidth, height: fittedHeight };
}

export function cameraGroundFrustum(camera: ShotCamera, distanceM = 6): { left: { x: number; z: number }; right: { x: number; z: number }; center: { x: number; z: number }; horizontalFovDeg: number } {
  const dx = camera.target.x - camera.position.x;
  const dz = camera.target.z - camera.position.z;
  const groundLength = Math.hypot(dx, dz);
  const fx = groundLength > 1e-9 ? dx / groundLength : 0;
  const fz = groundLength > 1e-9 ? dz / groundLength : -1;
  const half = THREE.MathUtils.degToRad(focalLengthToHorizontalFovDeg(camera.focalLengthMm, camera.sensorWidthMm) / 2);
  const rotate = (x: number, z: number, angle: number) => ({ x: x * Math.cos(angle) - z * Math.sin(angle), z: x * Math.sin(angle) + z * Math.cos(angle) });
  const leftDir = rotate(fx, fz, half);
  const rightDir = rotate(fx, fz, -half);
  const distance = Math.max(0.1, distanceM);
  return {
    left: { x: camera.position.x + leftDir.x * distance, z: camera.position.z + leftDir.z * distance },
    right: { x: camera.position.x + rightDir.x * distance, z: camera.position.z + rightDir.z * distance },
    center: { x: camera.position.x + fx * distance, z: camera.position.z + fz * distance },
    horizontalFovDeg: focalLengthToHorizontalFovDeg(camera.focalLengthMm, camera.sensorWidthMm),
  };
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
