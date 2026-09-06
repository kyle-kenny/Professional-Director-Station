import type { DirectorProject } from '../domain/model';

export const PROJECT_HISTORY_LIMIT = 100;

export type ProjectHistory = {
  undoStack: DirectorProject[];
  redoStack: DirectorProject[];
};

function snapshot(project: DirectorProject): DirectorProject {
  return structuredClone(project);
}

function pushBounded(stack: DirectorProject[], project: DirectorProject, limit: number): DirectorProject[] {
  const next = [...stack, snapshot(project)];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function recordProjectHistory(
  current: DirectorProject,
  history: ProjectHistory,
  limit = PROJECT_HISTORY_LIMIT,
): ProjectHistory {
  return {
    undoStack: pushBounded(history.undoStack, current, limit),
    redoStack: [],
  };
}

export function undoProjectHistory(
  current: DirectorProject,
  history: ProjectHistory,
  limit = PROJECT_HISTORY_LIMIT,
): { project: DirectorProject; history: ProjectHistory } | null {
  const index = history.undoStack.length - 1;
  if (index < 0) return null;
  const previous = history.undoStack[index];
  return {
    project: snapshot(previous),
    history: {
      undoStack: history.undoStack.slice(0, index),
      redoStack: pushBounded(history.redoStack, current, limit),
    },
  };
}

export function redoProjectHistory(
  current: DirectorProject,
  history: ProjectHistory,
  limit = PROJECT_HISTORY_LIMIT,
): { project: DirectorProject; history: ProjectHistory } | null {
  const index = history.redoStack.length - 1;
  if (index < 0) return null;
  const next = history.redoStack[index];
  return {
    project: snapshot(next),
    history: {
      undoStack: pushBounded(history.undoStack, current, limit),
      redoStack: history.redoStack.slice(0, index),
    },
  };
}
