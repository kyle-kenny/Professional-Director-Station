import * as THREE from 'three';
import type { Shot, Transform, Vec3 } from '../domain/model';
import { defaultIkPlacement, type HumanoidRigState, type RigVec3 } from '../domain/humanoidRig';
import { sampleShotAtFrame } from '../editorial/timelineEngine';
import { sampleActorRig } from '../characters/rigRuntime';
import { focalLengthToVerticalFovDeg, projectWorldToFrame } from '../utils/math';
import { canonicalJson, sha256Text } from '../utils/sha256';

export const openPoseKeypointIds = [
  'nose', 'neck',
  'rShoulder', 'rElbow', 'rWrist',
  'lShoulder', 'lElbow', 'lWrist',
  'rHip', 'rKnee', 'rAnkle',
  'lHip', 'lKnee', 'lAnkle',
  'rEye', 'lEye', 'rEar', 'lEar',
] as const;
export type OpenPoseKeypointId = typeof openPoseKeypointIds[number];
export type ProjectedPoseKeypoint = { x: number; y: number; visible: boolean; cameraDepthM: number };

export type AiControlBundle = {
  schema: 'pds-ai-controls-1';
  shotId: string;
  shotVersion: number;
  frame: number;
  fps: number;
  frameAspect: number;
  cameraReference: {
    position: Vec3; target: Vec3; focalLengthMm: number; sensorWidthMm: number; frameAspect: number; verticalFovDeg: number; aperture: number; focusDistanceM: number;
  };
  pose: Array<{
    actorId: string;
    name: string;
    pose: string;
    action: string;
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    lookAt?: Vec3;
    /** Full frame-authoritative FK/IK/look-at state, so generation cannot silently discard director posing. */
    humanoidRig: HumanoidRigState;
    rigHashSha256: string;
  }>;
  /** OpenPose-compatible 18 point projection derived from the same frame-authoritative humanoid rig. */
  pose2d: Array<{ actorId: string; keypoints: Record<OpenPoseKeypointId, ProjectedPoseKeypoint> }>;
  depth: Array<{ actorId: string; cameraDepthM: number; normalized: number }>;
  lineart: Array<{ actorId: string; head: { x: number; y: number; visible: boolean }; center: { x: number; y: number; visible: boolean }; feet: { x: number; y: number; visible: boolean } }>;
  lights: Array<{ id: string; type: string; position: Vec3; target?: Vec3; intensity: number; colorTemperatureK: number }>;
};

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const normalize = (v: Vec3): Vec3 => { const len = Math.max(1e-9, length(v)); return { x: v.x / len, y: v.y / len, z: v.z / len }; };
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function quaternion(rotation?: RigVec3): THREE.Quaternion {
  if (!rotation) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ'));
}

function chainedQuaternion(...rotations: Array<RigVec3 | undefined>): THREE.Quaternion {
  const result = new THREE.Quaternion();
  for (const rotation of rotations) result.multiply(quaternion(rotation));
  return result.normalize();
}

function actorLocalToWorld(point: THREE.Vector3, transform: Transform): Vec3 {
  const value = point.clone().multiply(new THREE.Vector3(transform.scale.x, transform.scale.y, transform.scale.z));
  value.applyEuler(new THREE.Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z, 'XYZ'));
  value.add(new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z));
  return { x: value.x, y: value.y, z: value.z };
}

function twoBoneMidpoint(start: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number): THREE.Vector3 {
  const toTarget = target.clone().sub(start);
  const rawDistance = Math.max(1e-6, toTarget.length());
  const maxReach = Math.max(1e-4, l1 + l2 - 1e-4);
  const minReach = Math.abs(l1 - l2) + 1e-4;
  const distance = Math.min(maxReach, Math.max(minReach, rawDistance));
  const direction = toTarget.normalize();
  let bend = pole.clone().sub(start);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend = new THREE.Vector3(0, 0, -1).cross(direction);
    if (bend.lengthSq() < 1e-8) bend = new THREE.Vector3(1, 0, 0).cross(direction);
  }
  bend.normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return start.clone().addScaledVector(direction, along).addScaledVector(bend, height);
}

function buildActorPoseWorldPoints(
  heightM: number,
  shoulderWidthM: number,
  headRadiusM: number,
  transform: Transform,
  rig: HumanoidRigState,
): Record<OpenPoseKeypointId, Vec3> {
  const pelvisQ = chainedQuaternion(rig.fk.pelvis);
  const torsoQ = chainedQuaternion(rig.fk.pelvis, rig.fk.spine_01, rig.fk.spine_02, rig.fk.spine_03);
  const headQ = chainedQuaternion(rig.fk.pelvis, rig.fk.spine_01, rig.fk.spine_02, rig.fk.spine_03, rig.fk.neck_01, rig.fk.Head);
  const pelvis = v3(0, heightM * 0.52 + rig.rootOffsetY, 0);
  const shoulderCenter = pelvis.clone().add(v3(0, heightM * 0.285, 0).applyQuaternion(torsoQ));
  const neck = pelvis.clone().add(v3(0, heightM * 0.325, 0).applyQuaternion(torsoQ));
  const headCenter = neck.clone().add(v3(0, heightM * 0.06, 0).applyQuaternion(headQ));
  const nose = headCenter.clone().add(v3(0, headRadiusM * 0.08, -headRadiusM * 0.82).applyQuaternion(headQ));
  const rEye = headCenter.clone().add(v3(headRadiusM * 0.34, headRadiusM * 0.15, -headRadiusM * 0.72).applyQuaternion(headQ));
  const lEye = headCenter.clone().add(v3(-headRadiusM * 0.34, headRadiusM * 0.15, -headRadiusM * 0.72).applyQuaternion(headQ));
  const rEar = headCenter.clone().add(v3(headRadiusM * 0.88, headRadiusM * 0.08, 0).applyQuaternion(headQ));
  const lEar = headCenter.clone().add(v3(-headRadiusM * 0.88, headRadiusM * 0.08, 0).applyQuaternion(headQ));

  const rShoulder = shoulderCenter.clone().add(v3(shoulderWidthM * 0.5, 0, 0).applyQuaternion(torsoQ));
  const lShoulder = shoulderCenter.clone().add(v3(-shoulderWidthM * 0.5, 0, 0).applyQuaternion(torsoQ));
  const upperArmLength = heightM * 0.185;
  const forearmLength = heightM * 0.155;

  const armPoints = (side: 'leftHand' | 'rightHand', shoulder: THREE.Vector3, upperJoint: 'upperarm_l' | 'upperarm_r', lowerJoint: 'lowerarm_l' | 'lowerarm_r') => {
    const state = rig.ik[side];
    if (state.enabled) {
      const fallback = defaultIkPlacement(heightM, side);
      const target = state.lockedWorldTarget
        ? undefined
        : state.target ?? fallback.target;
      const pole = state.pole ?? fallback.pole;
      if (target && pole) {
        const targetPoint = v3(target.x, target.y, target.z);
        const polePoint = v3(pole.x, pole.y, pole.z);
        return { elbow: twoBoneMidpoint(shoulder, targetPoint, polePoint, upperArmLength, forearmLength), wrist: targetPoint };
      }
    }
    const upperQ = torsoQ.clone().multiply(quaternion(rig.fk[upperJoint])).normalize();
    const elbow = shoulder.clone().add(v3(0, -upperArmLength, 0).applyQuaternion(upperQ));
    const lowerQ = upperQ.clone().multiply(quaternion(rig.fk[lowerJoint])).normalize();
    const wrist = elbow.clone().add(v3(0, -forearmLength, 0).applyQuaternion(lowerQ));
    return { elbow, wrist };
  };

  const rightArm = armPoints('rightHand', rShoulder, 'upperarm_r', 'lowerarm_r');
  const leftArm = armPoints('leftHand', lShoulder, 'upperarm_l', 'lowerarm_l');

  const hipOffset = Math.max(heightM * 0.075, shoulderWidthM * 0.22);
  const rHip = pelvis.clone().add(v3(hipOffset, -heightM * 0.015, 0).applyQuaternion(pelvisQ));
  const lHip = pelvis.clone().add(v3(-hipOffset, -heightM * 0.015, 0).applyQuaternion(pelvisQ));
  const thighLength = heightM * 0.245;
  const calfLength = heightM * 0.245;

  const legPoints = (side: 'leftFoot' | 'rightFoot', hip: THREE.Vector3, thighJoint: 'thigh_l' | 'thigh_r', calfJoint: 'calf_l' | 'calf_r') => {
    const state = rig.ik[side];
    if (state.enabled) {
      const fallback = defaultIkPlacement(heightM, side);
      const target = state.lockedWorldTarget ? undefined : state.target ?? fallback.target;
      const pole = state.pole ?? fallback.pole;
      if (target && pole) {
        const targetPoint = v3(target.x, target.y, target.z);
        const polePoint = v3(pole.x, pole.y, pole.z);
        return { knee: twoBoneMidpoint(hip, targetPoint, polePoint, thighLength, calfLength), ankle: targetPoint };
      }
    }
    const thighQ = pelvisQ.clone().multiply(quaternion(rig.fk[thighJoint])).normalize();
    const knee = hip.clone().add(v3(0, -thighLength, 0).applyQuaternion(thighQ));
    const calfQ = thighQ.clone().multiply(quaternion(rig.fk[calfJoint])).normalize();
    const ankle = knee.clone().add(v3(0, -calfLength, 0).applyQuaternion(calfQ));
    return { knee, ankle };
  };

  const rightLeg = legPoints('rightFoot', rHip, 'thigh_r', 'calf_r');
  const leftLeg = legPoints('leftFoot', lHip, 'thigh_l', 'calf_l');

  const local: Record<OpenPoseKeypointId, THREE.Vector3> = {
    nose,
    neck,
    rShoulder,
    rElbow: rightArm.elbow,
    rWrist: rightArm.wrist,
    lShoulder,
    lElbow: leftArm.elbow,
    lWrist: leftArm.wrist,
    rHip,
    rKnee: rightLeg.knee,
    rAnkle: rightLeg.ankle,
    lHip,
    lKnee: leftLeg.knee,
    lAnkle: leftLeg.ankle,
    rEye,
    lEye,
    rEar,
    lEar,
  };

  return Object.fromEntries(openPoseKeypointIds.map((id) => [id, actorLocalToWorld(local[id], transform)])) as Record<OpenPoseKeypointId, Vec3>;
}

function projectPoseKeypoints(points: Record<OpenPoseKeypointId, Vec3>, camera: Shot['camera'], aspect: number): Record<OpenPoseKeypointId, ProjectedPoseKeypoint> {
  const forward = normalize(sub(camera.target, camera.position));
  return Object.fromEntries(openPoseKeypointIds.map((id) => {
    const point = points[id];
    const projected = projectWorldToFrame(point, camera, aspect);
    const cameraDepthM = dot(sub(point, camera.position), forward);
    return [id, { ...projected, visible: projected.visible && cameraDepthM > 0, cameraDepthM }];
  })) as Record<OpenPoseKeypointId, ProjectedPoseKeypoint>;
}

export function analyzeFrameControls(shot: Shot, frame: number): AiControlBundle {
  const sampled = sampleShotAtFrame(shot, frame);
  const camera = sampled.camera;
  const time = sampled.time;
  const forward = normalize(sub(camera.target, camera.position));
  const rawDepth = sampled.actors.map(({ actor, transform }) => ({ actorId: actor.id, cameraDepthM: Math.max(0, dot(sub(transform.position, camera.position), forward)) }));
  const positive = rawDepth.map((item) => item.cameraDepthM).filter((value) => value > 0);
  const near = positive.length ? Math.min(...positive) : 0;
  const far = positive.length ? Math.max(...positive) : 1;
  const span = Math.max(1e-6, far - near);
  const sampledRig = new Map(sampled.actors.map(({ actor }) => [actor.id, sampleActorRig(actor, time)]));

  return {
    schema: 'pds-ai-controls-1',
    shotId: shot.id,
    shotVersion: shot.version,
    frame: sampled.frame,
    fps: shot.fps,
    frameAspect: shot.frameAspect,
    cameraReference: {
      position: { ...camera.position }, target: { ...camera.target }, focalLengthMm: camera.focalLengthMm, sensorWidthMm: camera.sensorWidthMm, frameAspect: shot.frameAspect,
      verticalFovDeg: focalLengthToVerticalFovDeg(camera.focalLengthMm, camera.sensorWidthMm, shot.frameAspect), aperture: camera.aperture, focusDistanceM: camera.focusDistanceM,
    },
    pose: sampled.actors.map(({ actor, transform }) => {
      const humanoidRig = sampledRig.get(actor.id)!;
      return {
        actorId: actor.id,
        name: actor.name,
        pose: actor.pose,
        action: actor.action,
        position: { ...transform.position },
        rotation: { ...transform.rotation },
        scale: { ...transform.scale },
        lookAt: actor.lookAt ? { ...actor.lookAt } : undefined,
        humanoidRig,
        rigHashSha256: sha256Text(canonicalJson(humanoidRig)),
      };
    }),
    pose2d: sampled.actors.map(({ actor, transform }) => {
      const rig = sampledRig.get(actor.id)!;
      const worldPoints = buildActorPoseWorldPoints(actor.demographics.heightM, actor.demographics.shoulderWidthM, actor.demographics.headRadiusM, transform, rig);
      return { actorId: actor.id, keypoints: projectPoseKeypoints(worldPoints, camera, shot.frameAspect) };
    }),
    depth: rawDepth.map((item) => ({ ...item, normalized: far === near ? (item.cameraDepthM > 0 ? 0.5 : 0) : Math.min(1, Math.max(0, (item.cameraDepthM - near) / span)) })),
    lineart: sampled.actors.map(({ actor, transform }) => {
      const feetWorld = transform.position;
      const headWorld = { x: transform.position.x, y: transform.position.y + actor.eyeHeight, z: transform.position.z };
      const centerWorld = { x: transform.position.x, y: transform.position.y + actor.demographics.heightM * 0.5, z: transform.position.z };
      return { actorId: actor.id, head: projectWorldToFrame(headWorld, camera, shot.frameAspect), center: projectWorldToFrame(centerWorld, camera, shot.frameAspect), feet: projectWorldToFrame(feetWorld, camera, shot.frameAspect) };
    }),
    lights: sampled.lights.map((light) => ({ id: light.id, type: light.type, position: { ...light.position }, target: light.target ? { ...light.target } : undefined, intensity: light.intensity, colorTemperatureK: light.colorTemperatureK })),
  };
}

export function controlBundleHash(bundle: AiControlBundle): string {
  return sha256Text(canonicalJson(bundle));
}
