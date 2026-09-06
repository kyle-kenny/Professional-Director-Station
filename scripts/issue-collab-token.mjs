import { issueCollaborationToken } from '../server/auth.mjs';

const [userId, projectId, role = 'editor', displayName = userId, department = 'general'] = process.argv.slice(2);
const secret = process.env.PDS_AUTH_SECRET ?? '';
if (!userId || !projectId) {
  console.error('Usage: PDS_AUTH_SECRET=<32+ chars> npm run collab:token -- <userId> <projectId> [role] [displayName] [department]');
  process.exit(2);
}
if (!['owner', 'director', 'editor', 'reviewer', 'viewer'].includes(role)) {
  console.error(`Invalid role: ${role}`);
  process.exit(2);
}
console.log(issueCollaborationToken({ sub: userId, name: displayName, projectId, role, department }, secret));
