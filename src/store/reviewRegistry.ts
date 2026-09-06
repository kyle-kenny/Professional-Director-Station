import type { FrameAnnotation, ProjectMember, ShotVersionRecord } from '../domain/collaboration';
import { projectSchema, type DirectorProject, type Shot } from '../domain/model';
import { frameToTime, timeToFrame } from '../editorial/timelineEngine';
import { createImmutableShotVersion, requireShotStatusTransition, restoreShotVersion } from '../collab/reviewWorkflow';
import { getSessionIdentity } from '../collab/sessionIdentity';
import { requirePermission } from '../collab/authorization';
import { recordProjectHistory } from './projectHistory';
import { useDirectorStore } from './directorStore';

const STORAGE_KEY = 'pds.project.v1';

function persist(project: DirectorProject) {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

function commitProject(mutator: (project: DirectorProject) => void): DirectorProject {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  mutator(project);
  persist(project);
  useDirectorStore.setState({ project, ...history });
  return project;
}

function activeShot(project: DirectorProject): Shot {
  const state = useDirectorStore.getState();
  const shot = project.sequences.find((sequence) => sequence.id === state.activeSequenceId)?.shots.find((item) => item.id === state.activeShotId);
  if (!shot) throw new Error('Active shot not found');
  return shot;
}

function addVersionIfMissing(project: DirectorProject, shot: Shot, createdBy: string): ShotVersionRecord {
  const record = createImmutableShotVersion(shot, createdBy);
  const existing = project.collaboration.versions.find((item) => item.id === record.id);
  if (!existing) project.collaboration.versions.push(record);
  return existing ?? record;
}

export function captureActiveShotVersion(): ShotVersionRecord {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  let result!: ShotVersionRecord;
  commitProject((project) => {
    const shot = activeShot(project);
    result = addVersionIfMissing(project, shot, identity.userId);
    shot.version += 1;
  });
  return result;
}

export function transitionActiveShotStatus(to: Shot['status'], note?: string): void {
  const identity = getSessionIdentity();
  commitProject((project) => {
    const shot = activeShot(project);
    const from = shot.status;
    if (from === to) return;
    requireShotStatusTransition(from, to, identity.role);
    if (from === 'APPROVED' && to === 'WIP') shot.version += 1;
    shot.status = to;
    if (to === 'REVIEW' || to === 'APPROVED') addVersionIfMissing(project, shot, identity.userId);
    project.collaboration.approvals.push({
      id: `approval-${Date.now()}-${shot.id}`,
      shotId: shot.id,
      from,
      to,
      actorId: identity.userId,
      actorName: identity.displayName,
      at: new Date().toISOString(),
      note: note?.trim() || undefined,
    });
  });
}

export function addReviewComment(text: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'review:comment');
  const body = text.trim();
  if (!body) return;
  commitProject((project) => {
    const shot = activeShot(project);
    const state = useDirectorStore.getState();
    const frame = timeToFrame(state.playhead, shot.fps);
    project.collaboration.comments.push({
      id: `review-${Date.now()}-${frame}`,
      shotId: shot.id,
      frame,
      authorId: identity.userId,
      authorName: identity.displayName,
      text: body,
      createdAt: new Date().toISOString(),
    });
  });
}

export function resolveReviewComment(commentId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'review:comment');
  commitProject((project) => {
    const comment = project.collaboration.comments.find((item) => item.id === commentId);
    if (!comment) return;
    comment.resolvedAt = new Date().toISOString();
    comment.resolvedBy = identity.userId;
  });
}

export function addFrameAnnotation(annotation: Omit<FrameAnnotation, 'id' | 'shotId' | 'frame' | 'authorId' | 'createdAt'>): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'review:comment');
  commitProject((project) => {
    const shot = activeShot(project);
    const state = useDirectorStore.getState();
    const frame = timeToFrame(state.playhead, shot.fps);
    project.collaboration.annotations.push({
      ...annotation,
      id: `annotation-${Date.now()}-${frame}`,
      shotId: shot.id,
      frame,
      authorId: identity.userId,
      createdAt: new Date().toISOString(),
    });
  });
}

export function removeFrameAnnotation(annotationId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'review:comment');
  commitProject((project) => {
    project.collaboration.annotations = project.collaboration.annotations.filter((item) => item.id !== annotationId || item.authorId !== identity.userId);
  });
}

export function rollbackToShotVersion(versionId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  commitProject((project) => {
    const current = activeShot(project);
    const record = project.collaboration.versions.find((item) => item.id === versionId);
    if (!record || record.shotId !== current.id) throw new Error('Shot version not found for active shot.');
    const restored = restoreShotVersion(record);
    restored.version = Math.max(current.version + 1, restored.version + 1);
    restored.status = 'WIP';
    const sequence = project.sequences.find((item) => item.shots.some((shot) => shot.id === current.id));
    if (!sequence) throw new Error('Sequence not found for rollback.');
    sequence.shots = sequence.shots.map((shot) => shot.id === current.id ? restored : shot);
    project.collaboration.approvals.push({
      id: `rollback-${Date.now()}-${current.id}`,
      shotId: current.id,
      from: current.status,
      to: 'WIP',
      actorId: identity.userId,
      actorName: identity.displayName,
      at: new Date().toISOString(),
      note: `Rollback from immutable version ${record.id}`,
    });
  });
  useDirectorStore.setState({ playhead: 0 });
}

export function upsertProjectMember(member: ProjectMember): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'members:manage');
  commitProject((project) => {
    const index = project.collaboration.members.findIndex((item) => item.userId === member.userId);
    if (index >= 0) project.collaboration.members[index] = { ...member };
    else project.collaboration.members.push({ ...member });
  });
}

export function removeProjectMember(userId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'members:manage');
  if (userId === identity.userId) throw new Error('Cannot remove the active authenticated user from the project.');
  commitProject((project) => {
    project.collaboration.members = project.collaboration.members.filter((member) => member.userId !== userId);
  });
}

export function applyAuthoritativeProject(value: unknown): DirectorProject {
  const project = projectSchema.parse(value);
  const state = useDirectorStore.getState();
  persist(project);
  const sequenceId = project.sequences.some((sequence) => sequence.id === state.activeSequenceId) ? state.activeSequenceId : project.sequences[0].id;
  const sequence = project.sequences.find((item) => item.id === sequenceId)!;
  const shotId = sequence.shots.some((shot) => shot.id === state.activeShotId) ? state.activeShotId : sequence.shots[0].id;
  const shot = sequence.shots.find((item) => item.id === shotId)!;
  useDirectorStore.setState({
    project,
    activeSequenceId: sequenceId,
    activeShotId: shotId,
    playhead: frameToTime(Math.min(timeToFrame(state.playhead, shot.fps), Math.round(shot.duration * shot.fps)), shot.fps),
    undoStack: [],
    redoStack: [],
  });
  return project;
}
