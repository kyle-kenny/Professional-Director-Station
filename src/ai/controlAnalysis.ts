import type { Shot, Vec3 } from '../domain/model';
import { sampleShotAtFrame } from '../editorial/timelineEngine';
import { focalLengthToVerticalFovDeg, projectWorldToFrame } from '../utils/math';
import { canonicalJson, sha256Text } from '../utils/sha256';

export type AiControlBundle = {
  schema: 'pds-ai-controls-1';
  shotId: string;
  shotVersion: number;
  frame: number;
  fps: number;
  cameraReference: {
    position: Vec3; target: Vec3; focalLengthMm: number; sensorWidthMm: number; verticalFovDeg: number; aperture: number; focusDistanceM: number;
  };
  pose: Array<{ actorId: string; name: string; pose: string; action: string; position: Vec3; rotation: Vec3; scale: Vec3; lookAt?: Vec3 }>;
  depth: Array<{ actorId: string; cameraDepthM: number; normalized: number }>;
  lineart: Array<{ actorId: string; head: { x: number; y: number; visible: boolean }; center: { x: number; y: number; visible: boolean }; feet: { x: number; y: number; visible: boolean } }>;
  lights: Array<{ id: string; type: string; position: Vec3; target?: Vec3; intensity: number; colorTemperatureK: number }>;
};

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const normalize = (v: Vec3): Vec3 => { const len = Math.max(1e-9, length(v)); return { x: v.x / len, y: v.y / len, z: v.z / len }; };
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export function analyzeFrameControls(shot: Shot, frame: number): AiControlBundle {
  const sampled = sampleShotAtFrame(shot, frame);
  const camera = sampled.camera;
  const forward = normalize(sub(camera.target, camera.position));
  const rawDepth = sampled.actors.map(({ actor, transform }) => ({ actorId: actor.id, cameraDepthM: Math.max(0, dot(sub(transform.position, camera.position), forward)) }));
  const positive = rawDepth.map((item) => item.cameraDepthM).filter((value) => value > 0);
  const near = positive.length ? Math.min(...positive) : 0;
  const far = positive.length ? Math.max(...positive) : 1;
  const span = Math.max(1e-6, far - near);

  return {
    schema: 'pds-ai-controls-1',
    shotId: shot.id,
    shotVersion: shot.version,
    frame: sampled.frame,
    fps: shot.fps,
    cameraReference: {
      position: { ...camera.position }, target: { ...camera.target }, focalLengthMm: camera.focalLengthMm, sensorWidthMm: camera.sensorWidthMm,
      verticalFovDeg: focalLengthToVerticalFovDeg(camera.focalLengthMm, camera.sensorWidthMm), aperture: camera.aperture, focusDistanceM: camera.focusDistanceM,
    },
    pose: sampled.actors.map(({ actor, transform }) => ({ actorId: actor.id, name: actor.name, pose: actor.pose, action: actor.action, position: { ...transform.position }, rotation: { ...transform.rotation }, scale: { ...transform.scale }, lookAt: actor.lookAt ? { ...actor.lookAt } : undefined })),
    depth: rawDepth.map((item) => ({ ...item, normalized: far === near ? (item.cameraDepthM > 0 ? 0.5 : 0) : Math.min(1, Math.max(0, (item.cameraDepthM - near) / span)) })),
    lineart: sampled.actors.map(({ actor, transform }) => {
      const feetWorld = transform.position;
      const headWorld = { x: transform.position.x, y: transform.position.y + actor.eyeHeight, z: transform.position.z };
      const centerWorld = { x: transform.position.x, y: transform.position.y + actor.demographics.heightM * 0.5, z: transform.position.z };
      return { actorId: actor.id, head: projectWorldToFrame(headWorld, camera), center: projectWorldToFrame(centerWorld, camera), feet: projectWorldToFrame(feetWorld, camera) };
    }),
    lights: sampled.lights.map((light) => ({ id: light.id, type: light.type, position: { ...light.position }, target: light.target ? { ...light.target } : undefined, intensity: light.intensity, colorTemperatureK: light.colorTemperatureK })),
  };
}

export function controlBundleHash(bundle: AiControlBundle): string {
  return sha256Text(canonicalJson(bundle));
}
