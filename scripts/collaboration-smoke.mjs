import { issueCollaborationToken, verifyCollaborationToken } from '../server/auth.mjs';
import { canInitializeProjectRoom, effectiveProjectRole, hasProjectPermission } from '../server/authorization.mjs';

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
if (canInitializeProjectRoom('viewer') || canInitializeProjectRoom('reviewer')) throw new Error('read-only token can initialize authoritative room state');
if (!canInitializeProjectRoom('editor')) throw new Error('editor token cannot initialize project room');

console.log('PDS Gate 3 collaboration auth smoke PASSED');
