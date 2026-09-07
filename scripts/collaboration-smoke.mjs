import { createHash } from 'node:crypto';
import { issueCollaborationToken, verifyCollaborationToken } from '../server/auth.mjs';
import { canInitializeProjectRoom, effectiveProjectRole, hasProjectPermission } from '../server/authorization.mjs';
import { authorizeProjectMutation } from '../server/project-policy.mjs';

const secret = 'pds-ci-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const token = issueCollaborationToken({ sub: 'user-a', name: 'User A', projectId: 'project-demo', role: 'editor', department: 'editorial' }, secret, 3600);
const claims = verifyCollaborationToken(token, secret);
if (claims.sub !== 'user-a' || claims.projectId !== 'project-demo' || claims.role !== 'editor') throw new Error('token round-trip failed');

let tamperRejected = false;
try {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  payload.role = 'owner';
  const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;
  verifyCollaborationToken(tampered, secret);
} catch { tamperRejected = true; }
if (!tamperRejected) throw new Error('tampered auth token was accepted');

let expiredRejected = false;
try {
  const shortToken = issueCollaborationToken({ sub: 'user-b', projectId: 'project-demo', role: 'viewer' }, secret, 1);
  verifyCollaborationToken(shortToken, secret, Math.floor(Date.now() / 1000) + 2);
} catch { expiredRejected = true; }
if (!expiredRejected) throw new Error('expired auth token was accepted');

if (effectiveProjectRole('viewer', 'owner') !== 'viewer') throw new Error('project membership escalated a viewer token');
if (effectiveProjectRole('editor', 'owner') !== 'editor') throw new Error('project membership escalated an editor token');
if (effectiveProjectRole('director', 'reviewer') !== 'reviewer') throw new Error('project membership failed to demote token authority');
if (hasProjectPermission('viewer', 'owner', 'edit')) throw new Error('viewer token gained edit from project membership');
if (!hasProjectPermission('director', 'editor', 'edit')) throw new Error('valid clamped editor permission was lost');
if (canInitializeProjectRoom('viewer') || canInitializeProjectRoom('reviewer') || canInitializeProjectRoom('editor') || canInitializeProjectRoom('director')) throw new Error('non-owner token can initialize authoritative room state');
if (!canInitializeProjectRoom('owner')) throw new Error('owner token cannot initialize project room');

const baseShot = { id: 'shot-1', name: 'Shot 1', status: 'REVIEW', version: 1 };
const baseProject = {
  schemaVersion: 'pds-1', id: 'project-demo', name: 'Project', updatedAt: '2026-09-07T00:00:00.000Z',
  coordinateConvention: { handedness: 'right', upAxis: 'Y', forwardAxis: '-Z', linearUnit: 'meter' },
  sequences: [{ id: 'seq-1', name: 'Seq', shots: [baseShot] }], assets: [], pipeline: {}, ai: { outputs: [] },
  collaboration: { revision: 0, members: [], comments: [], annotations: [], versions: [], approvals: [] },
};
const reviewerIdentity = { sub: 'reviewer-1', name: 'Reviewer', projectId: 'project-demo', role: 'reviewer' };
const reviewerProject = structuredClone(baseProject);
reviewerProject.collaboration.comments.push({ id: 'c1', shotId: 'shot-1', frame: 0, authorId: 'reviewer-1', authorName: 'Reviewer', text: 'note', createdAt: '2026-09-07T00:00:01.000Z' });
const reviewerPolicy = authorizeProjectMutation(baseProject, reviewerProject, reviewerIdentity, 'reviewer');
if (!reviewerPolicy.ok || reviewerPolicy.requiresLock) throw new Error(`reviewer comment policy failed: ${reviewerPolicy.reason}`);

const editorIdentity = { sub: 'editor-1', name: 'Editor', projectId: 'project-demo', role: 'editor' };
const memberEscalation = structuredClone(baseProject);
memberEscalation.collaboration.members.push({ userId: 'editor-1', displayName: 'Editor', role: 'owner', department: 'editorial', active: true });
if (authorizeProjectMutation(baseProject, memberEscalation, editorIdentity, 'editor').ok) throw new Error('editor changed project membership');

const approved = structuredClone(baseProject);
approved.sequences[0].shots[0].status = 'APPROVED';
const snapshotJson = JSON.stringify(approved.sequences[0].shots[0]);
approved.collaboration.versions.push({
  id: 'shot-1:v1:approved', shotId: 'shot-1', version: 1, createdAt: '2026-09-07T00:00:02.000Z', createdBy: 'director-1', status: 'APPROVED',
  snapshotHashSha256: createHash('sha256').update(snapshotJson).digest('hex'), snapshotJson,
});
approved.collaboration.approvals.push({ id: 'a1', shotId: 'shot-1', from: 'REVIEW', to: 'APPROVED', actorId: 'director-1', actorName: 'Director', at: '2026-09-07T00:00:02.000Z' });
if (authorizeProjectMutation(baseProject, approved, editorIdentity, 'editor').ok) throw new Error('editor forged an approval');
const directorPolicy = authorizeProjectMutation(baseProject, approved, { sub: 'director-1', name: 'Director', projectId: 'project-demo', role: 'director' }, 'director');
if (!directorPolicy.ok || !directorPolicy.requiresLock) throw new Error(`director approval policy failed: ${directorPolicy.reason}`);

const tamperedApproved = structuredClone(approved);
tamperedApproved.sequences[0].shots[0].name = 'Silently modified';
if (authorizeProjectMutation(approved, tamperedApproved, { sub: 'director-1', name: 'Director', projectId: 'project-demo', role: 'director' }, 'director').ok) throw new Error('approved shot was mutated in place');

console.log('PDS Gate 3 collaboration auth/policy smoke PASSED');
