import { createHash } from 'node:crypto';
import { hasRolePermission } from './authorization.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mapBy = (items = [], key = 'id') => new Map(items.map((item) => [item?.[key], item]));

function contentProject(project) {
  const clone = structuredClone(project);
  delete clone.updatedAt;
  if (clone.collaboration) {
    clone.collaboration = {
      revision: 0,
      members: [],
      comments: [],
      annotations: [],
      versions: [],
      approvals: [],
    };
  }
  return clone;
}

function shotMap(project) {
  const result = new Map();
  for (const sequence of project?.sequences ?? []) for (const shot of sequence?.shots ?? []) result.set(shot.id, shot);
  return result;
}

function transitionPermission(from, to) {
  if (from === 'WIP' && to === 'REVIEW') return 'submit';
  if (from === 'REVIEW' && to === 'APPROVED') return 'approve';
  if (from === 'REVIEW' && to === 'WIP') return 'edit';
  if (from === 'APPROVED' && to === 'WIP') return 'approve';
  return undefined;
}

function immutableVersionValid(record) {
  if (!record?.snapshotJson || !/^[0-9a-f]{64}$/.test(String(record.snapshotHashSha256 ?? ''))) return false;
  const hash = createHash('sha256').update(record.snapshotJson).digest('hex');
  if (hash !== record.snapshotHashSha256) return false;
  try {
    const shot = JSON.parse(record.snapshotJson);
    return shot?.id === record.shotId && shot?.version === record.version && shot?.status === record.status;
  } catch {
    return false;
  }
}

function validateComments(current, next, identity, role) {
  if (same(current, next)) return undefined;
  if (!hasRolePermission(role, 'comment')) return 'comment-permission-denied';
  const before = mapBy(current);
  const after = mapBy(next);
  for (const [id, oldComment] of before) {
    const newComment = after.get(id);
    if (!newComment) return 'review-comment-delete-denied';
    const oldCore = { ...oldComment, resolvedAt: undefined, resolvedBy: undefined };
    const newCore = { ...newComment, resolvedAt: undefined, resolvedBy: undefined };
    if (!same(oldCore, newCore)) return 'review-comment-immutable';
    if (oldComment.resolvedAt) {
      if (!same(oldComment, newComment)) return 'resolved-comment-immutable';
    } else if (newComment.resolvedAt && newComment.resolvedBy !== identity.sub) return 'comment-resolution-identity-mismatch';
  }
  for (const [id, comment] of after) {
    if (!before.has(id) && comment.authorId !== identity.sub) return 'review-comment-author-mismatch';
  }
  return undefined;
}

function validateAnnotations(current, next, identity, role) {
  if (same(current, next)) return undefined;
  if (!hasRolePermission(role, 'comment')) return 'annotation-permission-denied';
  const before = mapBy(current);
  const after = mapBy(next);
  for (const [id, oldAnnotation] of before) {
    const newAnnotation = after.get(id);
    if (!newAnnotation) {
      if (oldAnnotation.authorId !== identity.sub) return 'annotation-delete-owner-mismatch';
      continue;
    }
    if (!same(oldAnnotation, newAnnotation)) return 'annotation-immutable';
  }
  for (const [id, annotation] of after) {
    if (!before.has(id) && annotation.authorId !== identity.sub) return 'annotation-author-mismatch';
  }
  return undefined;
}

function validateVersions(current, next, role) {
  if (same(current, next)) return undefined;
  if (!hasRolePermission(role, 'edit')) return 'version-permission-denied';
  const before = mapBy(current);
  const after = mapBy(next);
  for (const [id, record] of before) {
    const candidate = after.get(id);
    if (!candidate || !same(record, candidate)) return 'immutable-version-modified';
  }
  for (const [id, record] of after) {
    if (!before.has(id) && !immutableVersionValid(record)) return 'invalid-version-integrity';
  }
  return undefined;
}

function validateAiOutputs(current, next, role) {
  const before = mapBy(current);
  const after = mapBy(next);
  for (const [id, oldOutput] of before) {
    const output = after.get(id);
    if (!output) return 'generated-output-delete-denied';
    const mutable = ['status', 'approvedBy', 'approvedAt', 'rejectedBy', 'rejectedAt'];
    const oldCore = { ...oldOutput };
    const newCore = { ...output };
    for (const key of mutable) { delete oldCore[key]; delete newCore[key]; }
    if (!same(oldCore, newCore)) return 'generated-output-provenance-immutable';
    if (oldOutput.status !== output.status) {
      if (oldOutput.status !== 'generated' || !['approved', 'rejected'].includes(output.status)) return 'generated-output-status-immutable';
      if (!hasRolePermission(role, 'approve')) return 'generated-output-approval-denied';
    }
  }
  for (const [id, output] of after) {
    if (!before.has(id) && !['generated', 'failed'].includes(output.status)) return 'new-generated-output-invalid-status';
  }
  return undefined;
}

export function authorizeProjectMutation(current, next, identity, role) {
  if (!current || !next) return { ok: false, reason: 'missing-project', requiresLock: false };
  const collabBefore = current.collaboration ?? {};
  const collabAfter = next.collaboration ?? {};
  const generalChanged = !same(contentProject(current), contentProject(next));
  if (generalChanged && !hasRolePermission(role, 'edit')) return { ok: false, reason: 'edit-permission-denied', requiresLock: false };

  if (!same(collabBefore.members ?? [], collabAfter.members ?? []) && !hasRolePermission(role, 'members')) {
    return { ok: false, reason: 'members-permission-denied', requiresLock: false };
  }

  const commentError = validateComments(collabBefore.comments ?? [], collabAfter.comments ?? [], identity, role);
  if (commentError) return { ok: false, reason: commentError, requiresLock: false };
  const annotationError = validateAnnotations(collabBefore.annotations ?? [], collabAfter.annotations ?? [], identity, role);
  if (annotationError) return { ok: false, reason: annotationError, requiresLock: false };
  const versionError = validateVersions(collabBefore.versions ?? [], collabAfter.versions ?? [], role);
  if (versionError) return { ok: false, reason: versionError, requiresLock: false };

  const oldApprovals = collabBefore.approvals ?? [];
  const newApprovals = collabAfter.approvals ?? [];
  if (newApprovals.length < oldApprovals.length || !oldApprovals.every((event, index) => same(event, newApprovals[index]))) {
    return { ok: false, reason: 'approval-history-immutable', requiresLock: false };
  }
  const appendedApprovals = newApprovals.slice(oldApprovals.length);
  for (const event of appendedApprovals) if (event.actorId !== identity.sub) return { ok: false, reason: 'approval-actor-mismatch', requiresLock: false };

  const beforeShots = shotMap(current);
  const afterShots = shotMap(next);
  for (const [shotId, oldShot] of beforeShots) {
    const shot = afterShots.get(shotId);
    if (!shot) return { ok: false, reason: 'shot-delete-denied', requiresLock: false };
    if (oldShot.status === 'APPROVED' && shot.status === 'APPROVED' && !same(oldShot, shot)) {
      return { ok: false, reason: 'approved-shot-immutable', requiresLock: false };
    }
    if (oldShot.status !== shot.status) {
      const permission = transitionPermission(oldShot.status, shot.status);
      if (!permission || !hasRolePermission(role, permission)) return { ok: false, reason: 'shot-status-permission-denied', requiresLock: false };
      const auditEvent = appendedApprovals.find((event) => event.shotId === shotId && event.from === oldShot.status && event.to === shot.status && event.actorId === identity.sub);
      if (!auditEvent) return { ok: false, reason: 'shot-status-audit-event-required', requiresLock: false };
      if (shot.status === 'REVIEW' || shot.status === 'APPROVED') {
        const hasVersion = (collabAfter.versions ?? []).some((record) => record.shotId === shotId && record.status === shot.status && immutableVersionValid(record));
        if (!hasVersion) return { ok: false, reason: 'shot-status-version-required', requiresLock: false };
      }
    }
  }

  const aiError = validateAiOutputs(current.ai?.outputs ?? [], next.ai?.outputs ?? [], role);
  if (aiError) return { ok: false, reason: aiError, requiresLock: false };

  return { ok: true, reason: undefined, requiresLock: generalChanged };
}
