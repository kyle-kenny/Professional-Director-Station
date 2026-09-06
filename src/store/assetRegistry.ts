import { assetRefSchema, type AssetRef } from '../domain/model';
import { validateAssetForPipeline } from '../utils/assetRules';
import { useDirectorStore } from './directorStore';
import { recordProjectHistory } from './projectHistory';

const STORAGE_KEY = 'pds.project.v1';

function persistAssetProject(project: ReturnType<typeof useDirectorStore.getState>['project']) {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function uniqueAssetId(preferredId: string, assets: AssetRef[]): string {
  const occupied = new Set(assets.map((asset) => asset.id));
  if (!occupied.has(preferredId)) return preferredId;
  let index = 2;
  while (occupied.has(`${preferredId}-${index}`)) index += 1;
  return `${preferredId}-${index}`;
}

export function validateProjectAssetCandidate(candidate: AssetRef, assets: AssetRef[]): AssetRef {
  const asset = assetRefSchema.parse(candidate);
  const pipelineErrors = validateAssetForPipeline(asset);
  if (pipelineErrors.length) throw new Error(pipelineErrors.join('\n'));
  if (assets.some((item) => item.id === asset.id && item.version === asset.version)) {
    throw new Error(`Asset ${asset.id}@${asset.version} 已存在。`);
  }
  return asset;
}

export function registerProjectAsset(candidate: AssetRef): AssetRef {
  const state = useDirectorStore.getState();
  const asset = validateProjectAssetCandidate(candidate, state.project.assets);
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  project.assets.push(asset);
  project.assets.sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`));
  persistAssetProject(project);
  useDirectorStore.setState({ project, ...history });
  return asset;
}

export function unregisterProjectAsset(assetId: string, version: string): void {
  const state = useDirectorStore.getState();
  if (!state.project.assets.some((asset) => asset.id === assetId && asset.version === version)) return;
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  project.assets = project.assets.filter((asset) => !(asset.id === assetId && asset.version === version));
  persistAssetProject(project);
  useDirectorStore.setState({ project, ...history });
}
