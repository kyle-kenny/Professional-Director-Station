import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { PROJECT_HISTORY_LIMIT, recordProjectHistory, redoProjectHistory, undoProjectHistory } from '../store/projectHistory';

describe('project command history', () => {
  it('undoes and redoes immutable project snapshots', () => {
    const original = createDefaultProject();
    const edited = structuredClone(original);
    edited.sequences[0].shots[0].actors[0].transform.position.x = 4.25;

    const history = recordProjectHistory(original, { undoStack: [], redoStack: [] });
    const undone = undoProjectHistory(edited, history);
    expect(undone).not.toBeNull();
    expect(undone!.project.sequences[0].shots[0].actors[0].transform.position.x).toBe(original.sequences[0].shots[0].actors[0].transform.position.x);
    expect(undone!.project).not.toBe(original);

    const redone = redoProjectHistory(undone!.project, undone!.history);
    expect(redone).not.toBeNull();
    expect(redone!.project.sequences[0].shots[0].actors[0].transform.position.x).toBe(4.25);
  });

  it('clears redo history after a new edit', () => {
    const project = createDefaultProject();
    const history = recordProjectHistory(project, { undoStack: [], redoStack: [structuredClone(project)] });
    expect(history.redoStack).toHaveLength(0);
    expect(history.undoStack).toHaveLength(1);
  });

  it('bounds retained undo snapshots', () => {
    let history = { undoStack: [] as ReturnType<typeof createDefaultProject>[], redoStack: [] as ReturnType<typeof createDefaultProject>[] };
    for (let index = 0; index < PROJECT_HISTORY_LIMIT + 12; index += 1) {
      const project = createDefaultProject();
      project.sequences[0].shots[0].version = index + 1;
      history = recordProjectHistory(project, history);
    }
    expect(history.undoStack).toHaveLength(PROJECT_HISTORY_LIMIT);
    expect(history.undoStack[0].sequences[0].shots[0].version).toBe(13);
  });
});
