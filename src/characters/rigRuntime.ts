import * as THREE from 'three';
import type { Actor } from '../domain/model';
import { poseLibrary } from '../domain/poseLibrary';
import {
  clampJointRotation,
  defaultHeadLookAt,
  defaultIkPlacement,
  emptyRigState,
  humanoidJointIds,
  type HumanoidJointId,
  type HumanoidRigState,
  type IkLimbId,
  type RigControlId,
  type RigVec3,
} from '../domain/humanoidRig';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpVec = (a: RigVec3, b: RigVec3, t: number): RigVec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

function ease(value: number, easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out') {
  const t = clamp01(value);
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}

function lerpAngle(a: number, b: number, t: number) {
  const tau = Math.PI * 2;
  let delta = (b - a) % tau;
  if (delta > Math.PI) delta -= tau;
  if (delta < -Math.PI) delta += tau;
  return a + delta * t;
}

function lerpRotation(a: RigVec3, b: RigVec3, t: number): RigVec3 {
  return { x: lerpAngle(a.x, b.x, t), y: lerpAngle(a.y, b.y, t), z: lerpAngle(a.z, b.z, t) };
}

export function presetRigForActor(actor: Actor): HumanoidRigState {
  const rig = emptyRigState();
  const preset = poseLibrary[actor.pose as keyof typeof poseLibrary] ?? poseLibrary['neutral-standing'];
  rig.rootOffsetY = preset.rootOffsetY;
  const map: Array<[HumanoidJointId, RigVec3 | undefined]> = [
    ['spine_02', preset.jointRotations.torso],
    ['neck_01', preset.jointRotations.head],
    ['upperarm_l', preset.jointRotations.leftArm],
    ['upperarm_r', preset.jointRotations.rightArm],
    ['thigh_l', preset.jointRotations.leftLeg],
    ['thigh_r', preset.jointRotations.rightLeg],
  ];
  for (const [joint, rotation] of map) if (rotation) rig.fk[joint] = clampJointRotation(joint, rotation);
  return rig;
}

export function resolvedBaseRig(actor: Actor): HumanoidRigState {
  const base = presetRigForActor(actor);
  if (!actor.rig) return base;
  const source = actor.rig;
  base.rootOffsetY = source.rootOffsetY;
  for (const [joint, rotation] of Object.entries(source.fk)) {
    if (humanoidJointIds.includes(joint as HumanoidJointId)) base.fk[joint] = clampJointRotation(joint as HumanoidJointId, rotation);
  }
  base.ik = structuredClone(source.ik);
  base.headLookAt = structuredClone(source.headLookAt);
  return base;
}

function interpolateRig(from: HumanoidRigState, to: HumanoidRigState, t: number): HumanoidRigState {
  const result = emptyRigState();
  result.rootOffsetY = lerp(from.rootOffsetY, to.rootOffsetY, t);
  for (const joint of humanoidJointIds) {
    const a = from.fk[joint] ?? { x: 0, y: 0, z: 0 };
    const b = to.fk[joint] ?? { x: 0, y: 0, z: 0 };
    const mixed = lerpRotation(a, b, t);
    if (Math.abs(mixed.x) + Math.abs(mixed.y) + Math.abs(mixed.z) > 1e-8) result.fk[joint] = clampJointRotation(joint, mixed);
  }
  for (const limb of ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as IkLimbId[]) {
    const a = from.ik[limb], b = to.ik[limb];
    result.ik[limb] = {
      enabled: t < 0.5 ? a.enabled : b.enabled,
      locked: t < 0.5 ? a.locked : b.locked,
      target: a.target && b.target ? lerpVec(a.target, b.target, t) : structuredClone(a.target ?? b.target),
      pole: a.pole && b.pole ? lerpVec(a.pole, b.pole, t) : structuredClone(a.pole ?? b.pole),
      lockedWorldTarget: a.lockedWorldTarget && b.lockedWorldTarget ? lerpVec(a.lockedWorldTarget, b.lockedWorldTarget, t) : structuredClone(a.lockedWorldTarget ?? b.lockedWorldTarget),
    };
  }
  result.headLookAt = {
    enabled: t < 0.5 ? from.headLookAt.enabled : to.headLookAt.enabled,
    target: from.headLookAt.target && to.headLookAt.target ? lerpVec(from.headLookAt.target, to.headLookAt.target, t) : structuredClone(from.headLookAt.target ?? to.headLookAt.target),
  };
  return result;
}

export function sampleActorRig(actor: Actor, time: number): HumanoidRigState {
  const frames = [...(actor.posePath ?? [])].sort((a, b) => a.time - b.time);
  if (frames.length === 0) return resolvedBaseRig(actor);
  if (time <= frames[0].time) return structuredClone(frames[0].rig);
  const last = frames[frames.length - 1];
  if (time >= last.time) return structuredClone(last.rig);
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index]; const to = frames[index + 1];
    if (time < from.time || time > to.time) continue;
    const span = Math.max(1e-6, to.time - from.time);
    return interpolateRig(from.rig, to.rig, ease((time - from.time) / span, from.easing));
  }
  return resolvedBaseRig(actor);
}

export function rigControlToLimb(control: RigControlId): IkLimbId | undefined {
  if (control.startsWith('leftHand') || control === 'leftElbowPole') return 'leftHand';
  if (control.startsWith('rightHand') || control === 'rightElbowPole') return 'rightHand';
  if (control.startsWith('leftFoot') || control === 'leftKneePole') return 'leftFoot';
  if (control.startsWith('rightFoot') || control === 'rightKneePole') return 'rightFoot';
  return undefined;
}

export function controlPosition(actor: Actor, rig: HumanoidRigState, control: RigControlId): RigVec3 {
  if (control === 'headLookAt') return rig.headLookAt.target ?? defaultHeadLookAt(actor.demographics.heightM);
  const limb = rigControlToLimb(control)!;
  const placement = defaultIkPlacement(actor.demographics.heightM, limb);
  const state = rig.ik[limb];
  const isPole = control.endsWith('Pole');
  return structuredClone(isPole ? state.pole ?? placement.pole! : state.target ?? placement.target!);
}

export function jointDrivenByIk(rig: HumanoidRigState, joint: HumanoidJointId) {
  if (['upperarm_l', 'lowerarm_l', 'hand_l'].includes(joint)) return rig.ik.leftHand.enabled;
  if (['upperarm_r', 'lowerarm_r', 'hand_r'].includes(joint)) return rig.ik.rightHand.enabled;
  if (['thigh_l', 'calf_l', 'foot_l'].includes(joint)) return rig.ik.leftFoot.enabled;
  if (['thigh_r', 'calf_r', 'foot_r'].includes(joint)) return rig.ik.rightFoot.enabled;
  return false;
}

const BASE_QUATERNION_KEY = 'pdsNeutralQuaternion';

export function captureNeutralRigBase(root: THREE.Object3D) {
  for (const joint of humanoidJointIds) {
    const bone = root.getObjectByName(joint);
    if (!bone) continue;
    bone.userData[BASE_QUATERNION_KEY] = bone.quaternion.toArray();
    bone.userData.rigJointId = joint;
  }
}

function baseQuaternion(bone: THREE.Object3D) {
  const stored = bone.userData[BASE_QUATERNION_KEY] as number[] | undefined;
  return stored?.length === 4 ? new THREE.Quaternion(stored[0], stored[1], stored[2], stored[3]) : bone.quaternion.clone();
}

function resetRigBones(root: THREE.Object3D) {
  for (const joint of humanoidJointIds) {
    const bone = root.getObjectByName(joint);
    if (bone) bone.quaternion.copy(baseQuaternion(bone));
  }
}

export function applyAdditiveJointRotationToBone(bone: THREE.Object3D, joint: HumanoidJointId, rotation: RigVec3): RigVec3 {
  const limited = clampJointRotation(joint, rotation);
  const additive = new THREE.Quaternion().setFromEuler(new THREE.Euler(limited.x, limited.y, limited.z, 'XYZ'));
  bone.quaternion.copy(baseQuaternion(bone).multiply(additive)).normalize();
  bone.updateWorldMatrix(false, true);
  return limited;
}

function applyFk(root: THREE.Object3D, rig: HumanoidRigState) {
  for (const joint of humanoidJointIds) {
    const rotation = rig.fk[joint];
    if (!rotation) continue;
    const bone = root.getObjectByName(joint);
    if (!bone) continue;
    applyAdditiveJointRotationToBone(bone, joint, rotation);
  }
}

function aimBoneAt(bone: THREE.Object3D, child: THREE.Object3D, targetWorld: THREE.Vector3) {
  bone.updateWorldMatrix(true, true);
  child.updateWorldMatrix(true, false);
  const bonePos = bone.getWorldPosition(new THREE.Vector3());
  const childPos = child.getWorldPosition(new THREE.Vector3());
  const current = childPos.sub(bonePos).normalize();
  const desired = targetWorld.clone().sub(bonePos).normalize();
  if (current.lengthSq() < 1e-8 || desired.lengthSq() < 1e-8) return;
  const deltaWorld = new THREE.Quaternion().setFromUnitVectors(current, desired);
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorld = deltaWorld.multiply(world);
  const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld)).normalize();
  bone.updateWorldMatrix(false, true);
}

function twoBoneIk(root: THREE.Object3D, upperName: string, lowerName: string, endName: string, target: RigVec3, pole: RigVec3, lockedWorldTarget?: RigVec3) {
  const upper = root.getObjectByName(upperName);
  const lower = root.getObjectByName(lowerName);
  const end = root.getObjectByName(endName);
  if (!upper || !lower || !end) return;
  root.updateWorldMatrix(true, true);
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const elbow = lower.getWorldPosition(new THREE.Vector3());
  const wrist = end.getWorldPosition(new THREE.Vector3());
  const l1 = Math.max(1e-4, shoulder.distanceTo(elbow));
  const l2 = Math.max(1e-4, elbow.distanceTo(wrist));
  const targetWorld = lockedWorldTarget
    ? new THREE.Vector3(lockedWorldTarget.x, lockedWorldTarget.y, lockedWorldTarget.z)
    : root.localToWorld(new THREE.Vector3(target.x, target.y, target.z));
  const poleWorld = root.localToWorld(new THREE.Vector3(pole.x, pole.y, pole.z));
  const toTarget = targetWorld.clone().sub(shoulder);
  const rawDistance = Math.max(1e-6, toTarget.length());
  const maxReach = Math.max(1e-4, l1 + l2 - 1e-4);
  const minReach = Math.abs(l1 - l2) + 1e-4;
  const distance = Math.min(maxReach, Math.max(minReach, rawDistance));
  const direction = toTarget.normalize();
  const reachableTarget = shoulder.clone().addScaledVector(direction, distance);
  let bend = poleWorld.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend = new THREE.Vector3(0, 1, 0).cross(direction);
    if (bend.lengthSq() < 1e-8) bend = new THREE.Vector3(1, 0, 0).cross(direction);
  }
  bend.normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const desiredElbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, height);
  aimBoneAt(upper, lower, desiredElbow);
  aimBoneAt(lower, end, reachableTarget);
}

function applyHeadLookAt(root: THREE.Object3D, actor: Actor, rig: HumanoidRigState) {
  if (!rig.headLookAt.enabled) return;
  const target = rig.headLookAt.target ?? defaultHeadLookAt(actor.demographics.heightM);
  const head = root.getObjectByName('Head');
  const neck = root.getObjectByName('neck_01');
  if (!head || !neck) return;
  root.updateWorldMatrix(true, true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const headLocal = root.worldToLocal(headWorld.clone());
  const direction = new THREE.Vector3(target.x - headLocal.x, target.y - headLocal.y, target.z - headLocal.z);
  const horizontal = Math.max(1e-6, Math.hypot(direction.x, direction.z));
  const yaw = THREE.MathUtils.clamp(Math.atan2(-direction.x, -direction.z), THREE.MathUtils.degToRad(-65), THREE.MathUtils.degToRad(65));
  const pitch = THREE.MathUtils.clamp(-Math.atan2(direction.y, horizontal), THREE.MathUtils.degToRad(-40), THREE.MathUtils.degToRad(40));
  const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.65, yaw * 0.65, 0, 'YXZ'));
  neck.quaternion.multiply(look).normalize();
}

export function applyRigToCharacter(root: THREE.Group, actor: Actor, rig: HumanoidRigState) {
  root.position.y = rig.rootOffsetY;
  resetRigBones(root);
  applyFk(root, rig);
  root.updateWorldMatrix(true, true);
  const limbs: Array<[IkLimbId, string, string, string]> = [
    ['leftHand', 'upperarm_l', 'lowerarm_l', 'hand_l'],
    ['rightHand', 'upperarm_r', 'lowerarm_r', 'hand_r'],
    ['leftFoot', 'thigh_l', 'calf_l', 'foot_l'],
    ['rightFoot', 'thigh_r', 'calf_r', 'foot_r'],
  ];
  for (const [id, upper, lower, end] of limbs) {
    const state = rig.ik[id];
    if (!state.enabled) continue;
    const defaults = defaultIkPlacement(actor.demographics.heightM, id);
    twoBoneIk(root, upper, lower, end, state.target ?? defaults.target!, state.pole ?? defaults.pole!, state.locked ? state.lockedWorldTarget : undefined);
  }
  applyHeadLookAt(root, actor, rig);
  root.updateWorldMatrix(true, true);
}

export function applyActorRigAtTime(root: THREE.Group, actor: Actor, time: number) {
  const rig = sampleActorRig(actor, time);
  applyRigToCharacter(root, actor, rig);
  return rig;
}

export function readAdditiveJointRotation(bone: THREE.Object3D, joint: HumanoidJointId): RigVec3 {
  const relative = baseQuaternion(bone).invert().multiply(bone.quaternion.clone()).normalize();
  const euler = new THREE.Euler().setFromQuaternion(relative, 'XYZ');
  return clampJointRotation(joint, { x: euler.x, y: euler.y, z: euler.z });
}
