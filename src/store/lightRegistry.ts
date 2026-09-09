import type { DirectorLight, DirectorProject, Shot } from '../domain/model';
import { createDirectorLightFromPreset, directorStageTarget, type DirectorLightToolPresetId } from '../domain/directorLights';
import { getSessionIdentity } from '../collab/sessionIdentity';
import { requirePermission } from '../collab/authorization';
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
}

function commitLights(mutator: (project: DirectorProject, shot: Shot) => string | void): string | undefined {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  const shot = activeShot(project);
  requireEditable(shot);
  const selectedId = mutator(project, shot);
  persist(project);
  useDirectorStore.setState({ project, ...history, selectedObjectId: selectedId ?? state.selectedObjectId });
  return selectedId;
}

function nextLightOrdinal(shot: Shot, shortLabel: string) {
  const re = new RegExp(`^${shortLabel}\\s+(\\d+)$`);
  const values = shot.lights.map((light) => light.name.match(re)?.[1]).filter(Boolean).map(Number);
  return Math.max(0, ...values) + 1;
}

function uniqueId(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function addDirectorLight(presetId: DirectorLightToolPresetId): string {
  let result = '';
  commitLights((_project, shot) => {
    const shortLabel = presetId === 'key-area' ? '主光' : presetId === 'fill-area' ? '补光' : presetId === 'rim-spot' ? '轮廓' : presetId === 'spot' ? '聚光' : presetId === 'point' ? '点光' : presetId === 'sun' ? '太阳' : '环境';
    const light = createDirectorLightFromPreset(shot, useDirectorStore.getState().playhead, presetId, nextLightOrdinal(shot, shortLabel), uniqueId(`light-${presetId}`));
    shot.lights.push(light);
    result = light.id;
    return light.id;
  });
  return result;
}

export function duplicateDirectorLight(lightId: string): string {
  let result = '';
  commitLights((_project, shot) => {
    const source = shot.lights.find((item) => item.id === lightId);
    if (!source) throw new Error('找不到要复制的灯具。');
    const clone: DirectorLight = structuredClone(source);
    clone.id = uniqueId(`light-copy`);
    clone.name = `${source.name} 副本`;
    clone.position.x += 0.45;
    clone.position.z += 0.25;
    clone.path = [];
    shot.lights.push(clone);
    result = clone.id;
    return clone.id;
  });
  return result;
}

export function removeDirectorLight(lightId: string) {
  commitLights((_project, shot) => {
    if (!shot.lights.some((item) => item.id === lightId)) return;
    shot.lights = shot.lights.filter((item) => item.id !== lightId);
  });
  const state = useDirectorStore.getState();
  if (state.selectedObjectId === lightId) useDirectorStore.setState({ selectedObjectId: undefined });
}

export function aimDirectorLightAtStage(lightId: string) {
  commitLights((_project, shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) throw new Error('找不到要重新瞄准的灯具。');
    if (light.type === 'point' || light.type === 'ambient') return light.id;
    light.target = directorStageTarget(shot, useDirectorStore.getState().playhead);
    return light.id;
  });
}
