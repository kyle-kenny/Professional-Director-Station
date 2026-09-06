import { create } from 'zustand';
import { projectSchema, type Actor, type CameraKeyframe, type DirectorLight, type DirectorProject, type LightKeyframe, type Shot, type Transform, type Vec3, type WorkspaceMode } from '../domain/model';
import { createDefaultProject } from '../domain/defaultProject';
import { lightingPresets, type LightingPresetId } from '../domain/presets';
import { createActorFromPreset, type ActorPresetId } from '../domain/actorLibrary';
import { createCameraRigPath, type CameraRigPresetId } from '../domain/cameraRigs';
import { createActorMotionPath, type MotionPresetId } from '../domain/actorMotions';
import { poseLibrary, type PosePresetId } from '../domain/poseLibrary';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import { recordProjectHistory, redoProjectHistory, undoProjectHistory } from './projectHistory';

const STORAGE_KEY = 'pds.project.v1';

export type TransformMode = 'translate' | 'rotate' | 'scale';

function loadProject(): DirectorProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProject();
    return projectSchema.parse(JSON.parse(raw));
  } catch {
    return createDefaultProject();
  }
}

function persist(project: DirectorProject) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

function stamp(project: DirectorProject): DirectorProject {
  project.updatedAt = new Date().toISOString();
  return project;
}

type State = {
  project: DirectorProject;
  activeSequenceId: string;
  activeShotId: string;
  mode: WorkspaceMode;
  playhead: number;
  selectedObjectId?: string;
  transformMode: TransformMode;
  undoStack: DirectorProject[];
  redoStack: DirectorProject[];
  setMode: (mode: WorkspaceMode) => void;
  setPlayhead: (time: number) => void;
  selectObject: (id?: string) => void;
  setTransformMode: (mode: TransformMode) => void;
  undo: () => void;
  redo: () => void;
  getActiveShot: () => Shot;
  updateActorTransformAxis: (actorId: string, field: keyof Transform, axis: keyof Vec3, value: number) => void;
  setActorTransform: (actorId: string, transform: Transform) => void;
  applyActorPose: (actorId: string, id: PosePresetId) => void;
  applyActorMotionPreset: (actorId: string, id: MotionPresetId) => void;
  addActorKeyframe: (actorId: string) => void;
  removeActorKeyframe: (actorId: string, time: number) => void;
  updateCamera: (field: 'focalLengthMm' | 'aperture' | 'focusDistanceM', value: number) => void;
  updateCameraVector: (field: 'position' | 'target', axis: keyof Vec3, value: number) => void;
  addCameraKeyframe: () => void;
  removeCameraKeyframe: (time: number) => void;
  applyCameraRigPreset: (id: CameraRigPresetId) => void;
  applyLightingPreset: (id: LightingPresetId) => void;
  updateLight: (lightId: string, field: 'intensity' | 'colorTemperatureK', value: number) => void;
  updateLightVector: (lightId: string, field: 'position' | 'target', axis: keyof Vec3, value: number) => void;
  setLightPosition: (lightId: string, position: Vec3) => void;
  addLightKeyframe: (lightId: string) => void;
  removeLightKeyframe: (lightId: string, time: number) => void;
  setLightCastShadow: (lightId: string, value: boolean) => void;
  setExposureEv: (value: number) => void;
  setShotStatus: (status: Shot['status']) => void;
  addAudioPlaceholder: (kind: 'dialogue' | 'music' | 'sfx' | 'ambience') => void;
  addActorPreset: (presetId: ActorPresetId) => void;
  saveVersion: () => void;
  exportProject: () => string;
  importProject: (json: string) => void;
};

function mutateActive(project: DirectorProject, sequenceId: string, shotId: string, fn: (shot: Shot) => void): DirectorProject {
  const clone = structuredClone(project);
  const seq = clone.sequences.find((s) => s.id === sequenceId);
  const shot = seq?.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error('Active shot not found');
  fn(shot);
  return stamp(clone);
}

function normalizeTransform(transform: Transform): Transform {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: {
      x: Math.max(0.01, transform.scale.x),
      y: Math.max(0.01, transform.scale.y),
      z: Math.max(0.01, transform.scale.z),
    },
  };
}

function snapShotTime(time: number, shot: Shot): number {
  return Math.min(shot.duration, Math.max(0, Math.round(time * shot.fps) / shot.fps));
}

function upsertActorKeyframe(actor: Actor, shot: Shot, time: number, transform: Transform) {
  const snapped = snapShotTime(time, shot);
  const tolerance = 0.5 / shot.fps;
  const existing = actor.path.find((frame) => Math.abs(frame.time - snapped) <= tolerance);
  const frame = {
    time: snapped,
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    easing: existing?.easing ?? 'ease-in-out' as const,
  };
  if (existing) Object.assign(existing, frame);
  else actor.path.push(frame);
  actor.path.sort((a, b) => a.time - b.time);
}

function upsertCameraKeyframe(shot: Shot, time: number, camera: CameraKeyframe) {
  const snapped = snapShotTime(time, shot);
  const tolerance = 0.5 / shot.fps;
  const existing = shot.camera.path.find((frame) => Math.abs(frame.time - snapped) <= tolerance);
  const frame: CameraKeyframe = { ...camera, time: snapped, easing: existing?.easing ?? camera.easing ?? 'ease-in-out' };
  if (existing) Object.assign(existing, frame);
  else shot.camera.path.push(frame);
  shot.camera.path.sort((a, b) => a.time - b.time);
}

function upsertLightKeyframe(light: DirectorLight, shot: Shot, time: number, sampled: DirectorLight) {
  const snapped = snapShotTime(time, shot);
  const tolerance = 0.5 / shot.fps;
  const existing = light.path.find((frame) => Math.abs(frame.time - snapped) <= tolerance);
  const frame: LightKeyframe = {
    time: snapped,
    position: { ...sampled.position },
    target: sampled.target ? { ...sampled.target } : undefined,
    intensity: sampled.intensity,
    colorTemperatureK: sampled.colorTemperatureK,
    easing: existing?.easing ?? 'ease-in-out',
  };
  if (existing) Object.assign(existing, frame);
  else light.path.push(frame);
  light.path.sort((a, b) => a.time - b.time);
}

function commitActive(state: State, fn: (shot: Shot) => void): Pick<State, 'project' | 'undoStack' | 'redoStack'> {
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = mutateActive(state.project, state.activeSequenceId, state.activeShotId, fn);
  persist(project);
  return { project, ...history };
}

const initial = loadProject();

export const useDirectorStore = create<State>((set, get) => ({
  project: initial,
  activeSequenceId: initial.sequences[0].id,
  activeShotId: initial.sequences[0].shots[0].id,
  mode: '3d',
  playhead: 0,
  selectedObjectId: initial.sequences[0].shots[0].actors[0]?.id,
  transformMode: 'translate',
  undoStack: [],
  redoStack: [],
  setMode: (mode) => set({ mode }),
  setPlayhead: (playhead) => set((state) => ({ playhead: Math.min(state.getActiveShot().duration, Math.max(0, playhead)) })),
  selectObject: (selectedObjectId) => set({ selectedObjectId }),
  setTransformMode: (transformMode) => set({ transformMode }),
  undo: () => set((state) => {
    const result = undoProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
    if (!result) return {};
    const project = stamp(result.project);
    persist(project);
    return { project, ...result.history };
  }),
  redo: () => set((state) => {
    const result = redoProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
    if (!result) return {};
    const project = stamp(result.project);
    persist(project);
    return { project, ...result.history };
  }),
  getActiveShot: () => {
    const { project, activeSequenceId, activeShotId } = get();
    const shot = project.sequences.find((s) => s.id === activeSequenceId)?.shots.find((s) => s.id === activeShotId);
    if (!shot) throw new Error('Active shot not found');
    return shot;
  },
  updateActorTransformAxis: (actorId, field, axis, value) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (!actor) return;
    if (actor.path.length > 0 && field !== 'scale') {
      const sampled = sampleActorTransform(actor, state.playhead);
      sampled[field][axis] = value;
      upsertActorKeyframe(actor, shot, state.playhead, sampled);
    } else {
      actor.transform[field][axis] = field === 'scale' ? Math.max(0.01, value) : value;
    }
  })),
  setActorTransform: (actorId, transform) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (!actor) return;
    const normalized = normalizeTransform(transform);
    if (actor.path.length > 0) {
      upsertActorKeyframe(actor, shot, state.playhead, normalized);
      actor.transform.scale = { ...normalized.scale };
    } else actor.transform = normalized;
  })),
  applyActorPose: (actorId, id) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (!actor) return;
    actor.pose = id;
    actor.action = poseLibrary[id].action;
  })),
  applyActorMotionPreset: (actorId, id) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (!actor) return;
    actor.path = createActorMotionPath(actor, shot.duration, id);
    actor.action = id;
    actor.pose = 'walk-stride';
  })),
  addActorKeyframe: (actorId) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (!actor) return;
    upsertActorKeyframe(actor, shot, state.playhead, sampleActorTransform(actor, state.playhead));
  })),
  removeActorKeyframe: (actorId, time) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (!actor) return;
    const snapped = snapShotTime(time, shot);
    const tolerance = 0.5 / shot.fps;
    actor.path = actor.path.filter((frame) => Math.abs(frame.time - snapped) > tolerance);
  })),
  updateCamera: (field, value) => set((state) => commitActive(state, (shot) => {
    if (field === 'focalLengthMm' && shot.camera.path.length > 0) {
      const sampled = sampleCamera(shot.camera, state.playhead);
      upsertCameraKeyframe(shot, state.playhead, { time: state.playhead, position: sampled.position, target: sampled.target, focalLengthMm: value, easing: 'ease-in-out' });
    } else shot.camera[field] = value;
  })),
  updateCameraVector: (field, axis, value) => set((state) => commitActive(state, (shot) => {
    if (shot.camera.path.length > 0) {
      const sampled = sampleCamera(shot.camera, state.playhead);
      sampled[field][axis] = value;
      upsertCameraKeyframe(shot, state.playhead, { time: state.playhead, position: sampled.position, target: sampled.target, focalLengthMm: sampled.focalLengthMm, easing: 'ease-in-out' });
    } else shot.camera[field][axis] = value;
  })),
  addCameraKeyframe: () => set((state) => commitActive(state, (shot) => {
    const sampled = sampleCamera(shot.camera, state.playhead);
    upsertCameraKeyframe(shot, state.playhead, { time: state.playhead, position: sampled.position, target: sampled.target, focalLengthMm: sampled.focalLengthMm, easing: 'ease-in-out' });
  })),
  removeCameraKeyframe: (time) => set((state) => commitActive(state, (shot) => {
    const snapped = snapShotTime(time, shot);
    const tolerance = 0.5 / shot.fps;
    shot.camera.path = shot.camera.path.filter((frame) => Math.abs(frame.time - snapped) > tolerance);
  })),
  applyCameraRigPreset: (id) => set((state) => commitActive(state, (shot) => { shot.camera.path = createCameraRigPath(shot.camera, shot.duration, id); })),
  applyLightingPreset: (id) => set((state) => commitActive(state, (shot) => { shot.lights = structuredClone(lightingPresets[id].lights); })),
  updateLight: (lightId, field, value) => set((state) => commitActive(state, (shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) return;
    const safeValue = field === 'intensity' ? Math.max(0, value) : Math.min(20000, Math.max(1000, value));
    if (light.path.length > 0) {
      const sampled = sampleLight(light, state.playhead);
      sampled[field] = safeValue;
      upsertLightKeyframe(light, shot, state.playhead, sampled);
    } else light[field] = safeValue;
  })),
  updateLightVector: (lightId, field, axis, value) => set((state) => commitActive(state, (shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) return;
    if (light.path.length > 0) {
      const sampled = sampleLight(light, state.playhead);
      if (field === 'target' && !sampled.target) sampled.target = { x: 0, y: 1.2, z: 0 };
      const vector = field === 'position' ? sampled.position : sampled.target!;
      vector[axis] = value;
      upsertLightKeyframe(light, shot, state.playhead, sampled);
    } else if (field === 'position') light.position[axis] = value;
    else {
      if (!light.target) light.target = { x: 0, y: 1.2, z: 0 };
      light.target[axis] = value;
    }
  })),
  setLightPosition: (lightId, position) => set((state) => commitActive(state, (shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) return;
    if (light.path.length > 0) {
      const sampled = sampleLight(light, state.playhead);
      sampled.position = { ...position };
      upsertLightKeyframe(light, shot, state.playhead, sampled);
    } else light.position = { ...position };
  })),
  addLightKeyframe: (lightId) => set((state) => commitActive(state, (shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) return;
    upsertLightKeyframe(light, shot, state.playhead, sampleLight(light, state.playhead));
  })),
  removeLightKeyframe: (lightId, time) => set((state) => commitActive(state, (shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) return;
    const snapped = snapShotTime(time, shot);
    const tolerance = 0.5 / shot.fps;
    light.path = light.path.filter((frame) => Math.abs(frame.time - snapped) > tolerance);
  })),
  setLightCastShadow: (lightId, value) => set((state) => commitActive(state, (shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (light) light.castShadow = value;
  })),
  setExposureEv: (value) => set((state) => commitActive(state, (shot) => { shot.exposureEv = Math.min(8, Math.max(-8, value)); })),
  setShotStatus: (status) => set((state) => commitActive(state, (shot) => { shot.status = status; })),
  addAudioPlaceholder: (kind) => set((state) => commitActive(state, (shot) => {
    const index = shot.audio.length + 1;
    shot.audio.push({ id: `audio-${Date.now()}`, name: `${kind.toUpperCase()} ${index}`, kind, start: 0, duration: Math.min(3, shot.duration), gainDb: 0, uri: '' });
  })),
  addActorPreset: (presetId) => set((state) => commitActive(state, (shot) => {
    const index = shot.actors.length + 1;
    const spread = ((index - 1) % 5) - 2;
    shot.actors.push(createActorFromPreset(presetId, index, spread * 0.9, -Math.floor((index - 1) / 5) * 1.1));
  })),
  saveVersion: () => set((state) => commitActive(state, (shot) => { shot.version += 1; })),
  exportProject: () => JSON.stringify(get().project, null, 2),
  importProject: (json) => {
    const parsed = stamp(projectSchema.parse(JSON.parse(json)));
    persist(parsed);
    set({
      project: parsed,
      activeSequenceId: parsed.sequences[0].id,
      activeShotId: parsed.sequences[0].shots[0].id,
      playhead: 0,
      selectedObjectId: parsed.sequences[0].shots[0].actors[0]?.id,
      undoStack: [],
      redoStack: [],
    });
  },
}));
