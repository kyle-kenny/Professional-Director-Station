import type { Actor, DirectorProject, Shot } from '../domain/model';
import { poseLibrary, type PosePresetId } from '../domain/poseLibrary';
import {
  clampJointRotation,
  defaultHeadLookAt,
  defaultIkPlacement,
  humanoidRigStateSchema,
  mirrorRigState,
  type CustomPose,
  type HumanoidJointId,
  type HumanoidRigState,
  type IkLimbId,
  type RigAxis,
  type RigVec3,
} from '../domain/humanoidRig';
import { presetRigForActor, sampleActorRig } from '../characters/rigRuntime';
import { getSessionIdentity } from '../collab/sessionIdentity';
import { requirePermission } from '../collab/authorization';
import { snapTimeToFrame } from '../editorial/timelineEngine';
import { recordProjectHistory } from './projectHistory';
import { useDirectorStore } from './directorStore';

const STORAGE_KEY = 'pds.project.v1';

function persist(project: DirectorProject) {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

function activeShot(project: DirectorProject): Shot {
  const state = useDirectorStore.getState();
  const shot = project.sequences.find((sequence) => sequence.id === state.activeSequenceId)?.shots.find((item) => item.id === state.activeShotId);
  if (!shot) throw new Error('找不到当前镜头。');
  return shot;
}

function requireEditable(shot: Shot) {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  if (shot.status === 'APPROVED') throw new Error('已批准镜头为只读；请先在审片工作区重新打开为新的 WIP。');
  return identity;
}

function commitPose(mutator: (project: DirectorProject, shot: Shot) => void) {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  const shot = activeShot(project);
  requireEditable(shot);
  mutator(project, shot);
  persist(project);
  useDirectorStore.setState({ project, ...history });
}

function actorById(shot: Shot, actorId: string) {
  const actor = shot.actors.find((item) => item.id === actorId);
  if (!actor) throw new Error('找不到要调姿的人物。');
  return actor;
}

function snappedTime(shot: Shot) {
  return snapTimeToFrame(useDirectorStore.getState().playhead, shot.duration, shot.fps);
}

function upsertPoseKeyframe(actor: Actor, shot: Shot, rig: HumanoidRigState) {
  const time = snappedTime(shot);
  const frames = actor.posePath ?? (actor.posePath = []);
  const tolerance = 0.5 / shot.fps;
  const existing = frames.find((frame) => Math.abs(frame.time - time) <= tolerance);
  const next = { time, rig: humanoidRigStateSchema.parse(structuredClone(rig)), easing: existing?.easing ?? 'ease-in-out' as const };
  if (existing) Object.assign(existing, next);
  else frames.push(next);
  frames.sort((a, b) => a.time - b.time);
}

function writeRig(actor: Actor, shot: Shot, rig: HumanoidRigState) {
  const normalized = humanoidRigStateSchema.parse(rig);
  if ((actor.posePath?.length ?? 0) > 0) upsertPoseKeyframe(actor, shot, normalized);
  else actor.rig = normalized;
  actor.action = 'pose-edit';
}

function editableRig(actor: Actor) {
  return sampleActorRig(actor, useDirectorStore.getState().playhead);
}

export function applyPresetPose(actorId: string, presetId: PosePresetId) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    actor.pose = presetId;
    actor.action = poseLibrary[presetId].action;
    if ((actor.posePath?.length ?? 0) > 0) upsertPoseKeyframe(actor, shot, presetRigForActor(actor));
    else actor.rig = undefined;
  });
}

export function setActorJointRotation(actorId: string, joint: HumanoidJointId, rotation: RigVec3) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    rig.fk[joint] = clampJointRotation(joint, rotation);
    writeRig(actor, shot, rig);
  });
}

export function setActorJointAxis(actorId: string, joint: HumanoidJointId, axis: RigAxis, valueRad: number) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    const current = rig.fk[joint] ?? { x: 0, y: 0, z: 0 };
    rig.fk[joint] = clampJointRotation(joint, { ...current, [axis]: valueRad });
    writeRig(actor, shot, rig);
  });
}

export function setActorIkEnabled(actorId: string, limb: IkLimbId, enabled: boolean) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    const defaults = defaultIkPlacement(actor.demographics.heightM, limb);
    rig.ik[limb] = { ...rig.ik[limb], enabled, target: rig.ik[limb].target ?? defaults.target, pole: rig.ik[limb].pole ?? defaults.pole };
    writeRig(actor, shot, rig);
  });
}

export function setActorIkLocked(actorId: string, limb: IkLimbId, locked: boolean) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    rig.ik[limb].locked = locked;
    writeRig(actor, shot, rig);
  });
}

export function setActorIkTarget(actorId: string, limb: IkLimbId, target: RigVec3) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    if (rig.ik[limb].locked) throw new Error('该 IK 目标已锁定，请先解锁。');
    rig.ik[limb].target = { ...target };
    rig.ik[limb].enabled = true;
    writeRig(actor, shot, rig);
  });
}

export function setActorIkPole(actorId: string, limb: IkLimbId, pole: RigVec3) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    if (rig.ik[limb].locked) throw new Error('该 IK 目标已锁定，请先解锁。');
    rig.ik[limb].pole = { ...pole };
    rig.ik[limb].enabled = true;
    writeRig(actor, shot, rig);
  });
}

export function setActorHeadLookAtEnabled(actorId: string, enabled: boolean) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    rig.headLookAt.enabled = enabled;
    rig.headLookAt.target ??= defaultHeadLookAt(actor.demographics.heightM);
    writeRig(actor, shot, rig);
  });
}

export function setActorHeadLookAt(actorId: string, target: RigVec3) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = editableRig(actor);
    rig.headLookAt = { enabled: true, target: { ...target } };
    writeRig(actor, shot, rig);
  });
}

export function mirrorActorPose(actorId: string) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    writeRig(actor, shot, mirrorRigState(editableRig(actor)));
  });
}

export function resetActorRig(actorId: string) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const rig = presetRigForActor(actor);
    if ((actor.posePath?.length ?? 0) > 0) upsertPoseKeyframe(actor, shot, rig);
    else actor.rig = undefined;
    actor.action = poseLibrary[actor.pose as PosePresetId]?.action ?? 'idle';
  });
}

export function addActorPoseKeyframe(actorId: string) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    upsertPoseKeyframe(actor, shot, editableRig(actor));
  });
}

export function removeActorPoseKeyframe(actorId: string, time: number) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    const snapped = snapTimeToFrame(time, shot.duration, shot.fps);
    const tolerance = 0.5 / shot.fps;
    actor.posePath = (actor.posePath ?? []).filter((frame) => Math.abs(frame.time - snapped) > tolerance);
  });
}

export function clearActorPoseAnimation(actorId: string) {
  commitPose((_project, shot) => {
    const actor = actorById(shot, actorId);
    actor.rig = editableRig(actor);
    actor.posePath = [];
  });
}

export function saveCustomPose(actorId: string, name: string): CustomPose {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('请输入自定义姿势名称。');
  let result!: CustomPose;
  commitPose((project, shot) => {
    const actor = actorById(shot, actorId);
    const identity = getSessionIdentity();
    result = {
      id: `pose-${crypto.randomUUID()}`,
      name: trimmed,
      rig: humanoidRigStateSchema.parse(editableRig(actor)),
      createdAt: new Date().toISOString(),
      createdBy: identity.userId,
    };
    project.customPoses ??= [];
    project.customPoses.push(result);
  });
  return result;
}

export function applyCustomPose(actorId: string, poseId: string) {
  commitPose((project, shot) => {
    const pose = (project.customPoses ?? []).find((item) => item.id === poseId);
    if (!pose) throw new Error('找不到自定义姿势。');
    const actor = actorById(shot, actorId);
    actor.pose = `custom:${pose.id}`;
    writeRig(actor, shot, structuredClone(pose.rig));
  });
}

export function deleteCustomPose(poseId: string) {
  commitPose((project) => {
    project.customPoses = (project.customPoses ?? []).filter((item) => item.id !== poseId);
  });
}
