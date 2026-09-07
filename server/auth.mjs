import { createHmac, timingSafeEqual } from 'node:crypto';
import { LOCAL_AUDIT_SECRET } from './local-audit-auth.mjs';

const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const decodeJson = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

function resolvedSecret(secret) {
  const host = process.env.PDS_COLLAB_HOST ?? '127.0.0.1';
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (loopback && process.env.PDS_ALLOW_INSECURE_LOCAL_AUTH === '1') return LOCAL_AUDIT_SECRET;
  const configured = String(secret ?? '').trim();
  return configured;
}

function signature(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function issueCollaborationToken(claims, secret, ttlSeconds = 8 * 60 * 60) {
  const signingSecret = resolvedSecret(secret);
  if (!signingSecret || signingSecret.length < 32) throw new Error('PDS_AUTH_SECRET must be at least 32 characters.');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: String(claims.sub),
    name: String(claims.name ?? claims.sub),
    projectId: String(claims.projectId),
    role: String(claims.role),
    department: String(claims.department ?? 'general'),
    iat: now,
    exp: now + ttlSeconds,
  };
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${signature(input, signingSecret)}`;
}

export function verifyCollaborationToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const signingSecret = resolvedSecret(secret);
  if (!signingSecret || signingSecret.length < 32) throw new Error('PDS_AUTH_SECRET must be at least 32 characters.');
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) throw new Error('Invalid collaboration token format.');
  const [headerPart, payloadPart, suppliedSignature] = parts;
  const header = decodeJson(headerPart);
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported collaboration token header.');
  const input = `${headerPart}.${payloadPart}`;
  const expected = Buffer.from(signature(input, signingSecret));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('Invalid collaboration token signature.');
  const payload = decodeJson(payloadPart);
  for (const field of ['sub', 'name', 'projectId', 'role', 'exp']) if (!payload[field]) throw new Error(`Token claim missing: ${field}`);
  if (!['owner', 'director', 'editor', 'reviewer', 'viewer'].includes(payload.role)) throw new Error('Invalid project role claim.');
  if (Number(payload.exp) <= nowSeconds) throw new Error('Collaboration token expired.');
  return payload;
}
