import { recordProjectHistory } from './projectHistory';
import { useDirectorStore } from './directorStore';

const STORAGE_KEY = 'pds.project.v1';

export const frameAspectPresets = [
  { label: '4:3 · Academy / classic', value: 4 / 3 },
  { label: '16:9 · HDTV / reference', value: 16 / 9 },
  { label: '1.85:1 · Flat', value: 1.85 },
  { label: '2.00:1 · Univisium', value: 2 },
  { label: '2.39:1 · Scope', value: 2.39 },
  { label: '9:16 · Vertical', value: 9 / 16 },
] as const;

function commitShotMetadata(mutator: (shot: ReturnType<typeof useDirectorStore.getState>['project']['sequences'][number]['shots'][number]) => void): void {
  const state = useDirectorStore.getState();
  if (state.getActiveShot().status === 'APPROVED') throw new Error('Approved Shot is immutable. Reopen it as a new WIP before changing camera or frame metadata.');
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  const shot = project.sequences.find((sequence) => sequence.id === state.activeSequenceId)?.shots.find((item) => item.id === state.activeShotId);
  if (!shot) throw new Error('Active Shot not found.');
  mutator(shot);
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  useDirectorStore.setState({ project, ...history });
}

export function setActiveShotFrameAspect(value: number): void {
  commitShotMetadata((shot) => { shot.frameAspect = Math.min(4, Math.max(0.25, value)); });
}

export function setActiveShotSensorWidthMm(value: number): void {
  commitShotMetadata((shot) => { shot.camera.sensorWidthMm = Math.min(200, Math.max(1, value)); });
}
