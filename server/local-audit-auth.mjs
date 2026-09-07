import { createHash } from 'node:crypto';

export const LOCAL_AUDIT_SECRET = createHash('sha256').update('pds-local-audit-auth-v1').digest('hex');

export function resolveCollaborationSecret(host, env = process.env) {
  const configured = String(env.PDS_AUTH_SECRET ?? '').trim();
  if (configured) return configured;
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (loopback && env.PDS_ALLOW_INSECURE_LOCAL_AUTH === '1') return LOCAL_AUDIT_SECRET;
  return '';
}
