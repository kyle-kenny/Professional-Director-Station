import type { PipelineConfig } from '../domain/pipeline';
import { pipelineConfigSchema } from '../domain/pipeline';
import { useDirectorStore } from './directorStore';
import { recordProjectHistory } from './projectHistory';

const STORAGE_KEY = 'pds.project.v1';

export function updatePipelineConfig(mutator: (pipeline: PipelineConfig) => void): void {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  const pipeline = structuredClone(project.pipeline);
  mutator(pipeline);
  project.pipeline = pipelineConfigSchema.parse(pipeline);
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  useDirectorStore.setState({ project, ...history });
}
