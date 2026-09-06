import { create } from 'zustand';
import { projectSchema, type DirectorProject, type Shot, type Transform, type Vec3, type WorkspaceMode } from '../domain/model';
import { createDefaultProject } from '../domain/defaultProject';
import { lightingPresets, type LightingPresetId } from '../domain/presets';
import { createActorFromPreset, type ActorPresetId } from '../domain/actorLibrary';
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
  updateCamera: (field: 'focalLengthMm' | 'aperture' | 'focusDistanceM', value: number) => void;
  updateCameraVector: (field: 'position' | 'target', axis: keyof Vec3, value: number) => void;
  applyLightingPreset: (id: LightingPresetId) => void;
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
  selectedObjectId: 'actor-a',
  transformMode: 'translate',
  undoStack: [],
  redoStack: [],
  setMode: (mode) => set({ mode }),
  setPlayhead: (playhead) => set({ playhead }),
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
    actor.transform[field][axis] = field === 'scale' ? Math.max(0.01, value) : value;
  })),
  setActorTransform: (actorId, transform) => set((state) => commitActive(state, (shot) => {
    const actor = shot.actors.find((a) => a.id === actorId);
    if (actor) actor.transform = normalizeTransform(transform);
  })),
  updateCamera: (field, value) => set((state) => commitActive(state, (shot) => { shot.camera[field] = value; })),
  updateCameraVector: (field, axis, value) => set((state) => commitActive(state, (shot) => { shot.camera[field][axis] = value; })),
  applyLightingPreset: (id) => set((state) => commitActive(state, (shot) => { shot.lights = structuredClone(lightingPresets[id].lights); })),
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
