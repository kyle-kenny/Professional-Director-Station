import { create } from 'zustand';
import { projectSchema, type DirectorProject, type Shot, type Vec3, type WorkspaceMode } from '../domain/model';
import { createDefaultProject } from '../domain/defaultProject';
import { lightingPresets, type LightingPresetId } from '../domain/presets';
import { createActorFromPreset, type ActorPresetId } from '../domain/actorLibrary';

const STORAGE_KEY = 'pds.project.v1';

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
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

type State = {
  project: DirectorProject;
  activeSequenceId: string;
  activeShotId: string;
  mode: WorkspaceMode;
  playhead: number;
  selectedObjectId?: string;
  setMode: (mode: WorkspaceMode) => void;
  setPlayhead: (time: number) => void;
  selectObject: (id?: string) => void;
  getActiveShot: () => Shot;
  updateActorPosition: (actorId: string, axis: keyof Vec3, value: number) => void;
  setActorPosition: (actorId: string, position: Vec3) => void;
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
  clone.updatedAt = new Date().toISOString();
  persist(clone);
  return clone;
}

const initial = loadProject();

export const useDirectorStore = create<State>((set, get) => ({
  project: initial,
  activeSequenceId: initial.sequences[0].id,
  activeShotId: initial.sequences[0].shots[0].id,
  mode: '3d',
  playhead: 0,
  selectedObjectId: 'actor-a',
  setMode: (mode) => set({ mode }),
  setPlayhead: (playhead) => set({ playhead }),
  selectObject: (selectedObjectId) => set({ selectedObjectId }),
  getActiveShot: () => {
    const { project, activeSequenceId, activeShotId } = get();
    const shot = project.sequences.find((s) => s.id === activeSequenceId)?.shots.find((s) => s.id === activeShotId);
    if (!shot) throw new Error('Active shot not found');
    return shot;
  },
  updateActorPosition: (actorId, axis, value) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => {
      const actor = shot.actors.find((a) => a.id === actorId);
      if (actor) actor.transform.position[axis] = value;
    }),
  })),
  setActorPosition: (actorId, position) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => {
      const actor = shot.actors.find((a) => a.id === actorId);
      if (actor) actor.transform.position = { ...position };
    }),
  })),
  updateCamera: (field, value) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => { shot.camera[field] = value; }),
  })),
  updateCameraVector: (field, axis, value) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => { shot.camera[field][axis] = value; }),
  })),
  applyLightingPreset: (id) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => { shot.lights = structuredClone(lightingPresets[id].lights); }),
  })),
  setShotStatus: (status) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => { shot.status = status; }),
  })),
  addAudioPlaceholder: (kind) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => {
      const index = shot.audio.length + 1;
      shot.audio.push({ id: `audio-${Date.now()}`, name: `${kind.toUpperCase()} ${index}`, kind, start: 0, duration: Math.min(3, shot.duration), gainDb: 0, uri: '' });
    }),
  })),
  addActorPreset: (presetId) => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => {
      const index = shot.actors.length + 1;
      const spread = ((index - 1) % 5) - 2;
      shot.actors.push(createActorFromPreset(presetId, index, spread * 0.9, -Math.floor((index - 1) / 5) * 1.1));
    }),
  })),
  saveVersion: () => set((state) => ({
    project: mutateActive(state.project, state.activeSequenceId, state.activeShotId, (shot) => { shot.version += 1; }),
  })),
  exportProject: () => JSON.stringify(get().project, null, 2),
  importProject: (json) => {
    const parsed = projectSchema.parse(JSON.parse(json));
    persist(parsed);
    set({ project: parsed, activeSequenceId: parsed.sequences[0].id, activeShotId: parsed.sequences[0].shots[0].id, playhead: 0 });
  },
}));
