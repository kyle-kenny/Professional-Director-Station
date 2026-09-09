import type { DirectorProject, Shot, Vec3 } from '../domain/model';
import { getSessionIdentity } from '../collab/sessionIdentity';
import { requirePermission } from '../collab/authorization';
import { recordProjectHistory } from './projectHistory';
import { useDirectorStore } from './directorStore';
import { parseCameraKeyframeSelectionId } from '../engine/sceneEntities';

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
  if (shot.status === 'APPROVED') throw new Error('已批准镜头为只读。');
}

function commitScene(mutator: (project: DirectorProject, shot: Shot) => void, selectedObjectId?: string) {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  const shot = activeShot(project);
  requireEditable(shot);
  mutator(project, shot);
  persist(project);
  useDirectorStore.setState({ project, ...history, selectedObjectId: selectedObjectId ?? state.selectedObjectId });
}

function snappedTime(time: number, fps: number) {
  return Math.round(time * fps) / fps;
}

export function removeActorEntity(actorId: string) {
  commitScene((_project, shot) => {
    shot.actors = shot.actors.filter((actor) => actor.id !== actorId);
  }, undefined);
  const state = useDirectorStore.getState();
  if (state.selectedObjectId === actorId) useDirectorStore.setState({ selectedObjectId: undefined });
}

export function setCameraEntityPose(position: Vec3, target: Vec3) {
  commitScene((_project, shot) => {
    if (shot.camera.path.length > 0) {
      const time = snappedTime(useDirectorStore.getState().playhead, shot.fps);
      const tolerance = 0.5 / shot.fps;
      const existing = shot.camera.path.find((frame) => Math.abs(frame.time - time) <= tolerance);
      const frame = {
        time,
        position: { ...position },
        target: { ...target },
        focalLengthMm: existing?.focalLengthMm ?? shot.camera.focalLengthMm,
        easing: existing?.easing ?? 'ease-in-out' as const,
      };
      if (existing) Object.assign(existing, frame);
      else shot.camera.path.push(frame);
      shot.camera.path.sort((a, b) => a.time - b.time);
    } else {
      shot.camera.position = { ...position };
      shot.camera.target = { ...target };
    }
  });
}

export function setCameraKeyframeEntityPose(time: number, position: Vec3, target: Vec3) {
  commitScene((_project, shot) => {
    const snapped = snappedTime(time, shot.fps);
    const tolerance = 0.5 / shot.fps;
    const frame = shot.camera.path.find((item) => Math.abs(item.time - snapped) <= tolerance);
    if (!frame) throw new Error('找不到要调整的机位。');
    frame.position = { ...position };
    frame.target = { ...target };
  });
}

export function setLightEntityPose(lightId: string, position: Vec3, target?: Vec3) {
  commitScene((_project, shot) => {
    const light = shot.lights.find((item) => item.id === lightId);
    if (!light) throw new Error('找不到要调整的灯具。');
    if (light.path.length > 0) {
      const time = snappedTime(useDirectorStore.getState().playhead, shot.fps);
      const tolerance = 0.5 / shot.fps;
      const existing = light.path.find((frame) => Math.abs(frame.time - time) <= tolerance);
      const frame = {
        time,
        position: { ...position },
        target: target ? { ...target } : undefined,
        intensity: existing?.intensity ?? light.intensity,
        colorTemperatureK: existing?.colorTemperatureK ?? light.colorTemperatureK,
        easing: existing?.easing ?? 'ease-in-out' as const,
      };
      if (existing) Object.assign(existing, frame);
      else light.path.push(frame);
      light.path.sort((a, b) => a.time - b.time);
    } else {
      light.position = { ...position };
      if (target) light.target = { ...target };
    }
  });
}

export type DeleteSceneResult = 'deleted' | 'protected-camera' | 'nothing';

/**
 * Delete follows the viewport selection. The shot's single master camera is schema-required,
 * so Delete removes camera keyframe positions but protects the master camera itself.
 */
export function deleteSceneSelection(selectedId?: string): DeleteSceneResult {
  if (!selectedId) return 'nothing';
  const state = useDirectorStore.getState();
  const shot = state.getActiveShot();
  const actor = shot.actors.find((item) => item.id === selectedId);
  if (actor) {
    removeActorEntity(actor.id);
    return 'deleted';
  }
  const light = shot.lights.find((item) => item.id === selectedId);
  if (light) {
    commitScene((_project, nextShot) => { nextShot.lights = nextShot.lights.filter((item) => item.id !== light.id); });
    useDirectorStore.setState({ selectedObjectId: undefined });
    return 'deleted';
  }
  const keyframeTime = parseCameraKeyframeSelectionId(selectedId);
  if (keyframeTime !== undefined) {
    commitScene((_project, nextShot) => {
      const snapped = snappedTime(keyframeTime, nextShot.fps);
      const tolerance = 0.5 / nextShot.fps;
      nextShot.camera.path = nextShot.camera.path.filter((frame) => Math.abs(frame.time - snapped) > tolerance);
    });
    useDirectorStore.setState({ selectedObjectId: shot.camera.id });
    return 'deleted';
  }
  if (selectedId === shot.camera.id) return 'protected-camera';
  return 'nothing';
}
