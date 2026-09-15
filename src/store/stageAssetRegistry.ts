import type { AssetRef, DirectorProject, Shot, StageAssetInstance, Transform } from '../domain/model';
import { stageAssetInstanceSchema } from '../domain/model';
import { getSessionIdentity } from '../collab/sessionIdentity';
import { requirePermission } from '../collab/authorization';
import { recordProjectHistory } from './projectHistory';
import { useDirectorStore } from './directorStore';

const STORAGE_KEY = 'pds.project.v1';
const stageKinds = new Set<AssetRef['category']>(['environment', 'prop', 'vehicle']);

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
  if (shot.status === 'APPROVED') throw new Error('已批准镜头为只读。');
}

function commitStageAsset(mutator: (project: DirectorProject, shot: Shot) => void, selectedObjectId?: string) {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  const shot = activeShot(project);
  requireEditable(shot);
  mutator(project, shot);
  persist(project);
  useDirectorStore.setState({ project, ...history, selectedObjectId: selectedObjectId ?? state.selectedObjectId });
}

function uniqueInstanceId(shot: Shot, asset: AssetRef) {
  const base = `stage-${asset.id}`;
  const occupied = new Set(shot.stageAssets.map((item) => item.id));
  if (!occupied.has(base)) return base;
  let index = 2;
  while (occupied.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function normalizeTransform(transform: Transform): Transform {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: {
      x: Math.max(0.001, transform.scale.x),
      y: Math.max(0.001, transform.scale.y),
      z: Math.max(0.001, transform.scale.z),
    },
  };
}

export function addStageAssetInstance(assetId: string, version: string): StageAssetInstance {
  const state = useDirectorStore.getState();
  const asset = state.project.assets.find((item) => item.id === assetId && item.version === version);
  if (!asset) throw new Error(`找不到资产 ${assetId}@${version}。`);
  if (!stageKinds.has(asset.category)) throw new Error('只有环境、道具和车辆资产可以作为 Stage 实例放入镜头。');
  if (!asset.sourceFormat) throw new Error('该资产没有可加载的 GLB / FBX 来源。');

  const shot = state.getActiveShot();
  const instance = stageAssetInstanceSchema.parse({
    id: uniqueInstanceId(shot, asset),
    name: asset.name,
    kind: asset.category,
    asset: structuredClone(asset),
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
    castShadow: asset.category !== 'environment',
    receiveShadow: true,
  });

  commitStageAsset((_project, active) => { active.stageAssets.push(instance); }, instance.id);
  return instance;
}

export function setStageAssetTransform(instanceId: string, transform: Transform) {
  commitStageAsset((_project, shot) => {
    const instance = shot.stageAssets.find((item) => item.id === instanceId);
    if (!instance) throw new Error('找不到要调整的 Stage 资产实例。');
    instance.transform = normalizeTransform(transform);
  }, instanceId);
}

export function setStageAssetVisibility(instanceId: string, visible: boolean) {
  commitStageAsset((_project, shot) => {
    const instance = shot.stageAssets.find((item) => item.id === instanceId);
    if (!instance) throw new Error('找不到 Stage 资产实例。');
    instance.visible = visible;
  }, instanceId);
}

export function setStageAssetShadow(instanceId: string, field: 'castShadow' | 'receiveShadow', value: boolean) {
  commitStageAsset((_project, shot) => {
    const instance = shot.stageAssets.find((item) => item.id === instanceId);
    if (!instance) throw new Error('找不到 Stage 资产实例。');
    instance[field] = value;
  }, instanceId);
}

export function duplicateStageAssetInstance(instanceId: string): StageAssetInstance {
  const state = useDirectorStore.getState();
  const shot = state.getActiveShot();
  const source = shot.stageAssets.find((item) => item.id === instanceId);
  if (!source) throw new Error('找不到要复制的 Stage 资产实例。');
  const duplicate = stageAssetInstanceSchema.parse({
    ...structuredClone(source),
    id: uniqueInstanceId(shot, source.asset),
    name: `${source.name} 副本`,
    transform: {
      ...structuredClone(source.transform),
      position: { ...source.transform.position, x: source.transform.position.x + 0.5 },
    },
  });
  commitStageAsset((_project, active) => { active.stageAssets.push(duplicate); }, duplicate.id);
  return duplicate;
}

export function removeStageAssetInstance(instanceId: string) {
  commitStageAsset((_project, shot) => {
    shot.stageAssets = shot.stageAssets.filter((item) => item.id !== instanceId);
  });
  const state = useDirectorStore.getState();
  if (state.selectedObjectId === instanceId) useDirectorStore.setState({ selectedObjectId: undefined });
}
