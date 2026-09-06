import { z } from 'zod';
import { projectRoleSchema } from '../domain/collaboration';
import { projectSchema, type DirectorProject } from '../domain/model';

export const presenceSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  role: projectRoleSchema,
  department: z.string().min(1).default('general'),
  shotId: z.string().optional(),
  objectId: z.string().optional(),
  frame: z.number().int().nonnegative().optional(),
  lastSeenAt: z.number().int().nonnegative(),
});
export type CollaborationPresence = z.infer<typeof presenceSchema>;

export const lockScopeSchema = z.enum(['shot', 'object']);
export type LockScope = z.infer<typeof lockScopeSchema>;

export const collaborationLockSchema = z.object({
  token: z.string().min(1),
  scope: lockScopeSchema,
  targetId: z.string().min(1),
  ownerId: z.string().min(1),
  ownerName: z.string().min(1),
  expiresAt: z.number().int().positive(),
});
export type CollaborationLock = z.infer<typeof collaborationLockSchema>;

export type MutationEnvelope = {
  type: 'mutate';
  mutationId: string;
  baseRevision: number;
  project: DirectorProject;
  lockTokens: string[];
};

export type ServerConflict = {
  type: 'conflict';
  mutationId: string;
  expectedRevision: number;
  receivedRevision: number;
  project: DirectorProject;
  reason: 'stale-revision' | 'lock-required' | 'permission-denied';
};

export function validateMutationEnvelope(value: unknown): MutationEnvelope {
  const schema = z.object({
    type: z.literal('mutate'),
    mutationId: z.string().min(1),
    baseRevision: z.number().int().nonnegative(),
    project: projectSchema,
    lockTokens: z.array(z.string()).default([]),
  });
  return schema.parse(value);
}

export function acceptRevision(baseRevision: number, authoritativeRevision: number): number {
  if (baseRevision !== authoritativeRevision) {
    throw new Error(`stale revision: expected ${authoritativeRevision}, received ${baseRevision}`);
  }
  return authoritativeRevision + 1;
}

export function activeLock(locks: CollaborationLock[], scope: LockScope, targetId: string, now = Date.now()): CollaborationLock | undefined {
  return locks.find((lock) => lock.scope === scope && lock.targetId === targetId && lock.expiresAt > now);
}

export function canAcquireLock(locks: CollaborationLock[], scope: LockScope, targetId: string, userId: string, now = Date.now()): boolean {
  const lock = activeLock(locks, scope, targetId, now);
  return !lock || lock.ownerId === userId;
}

export function pruneExpiredLocks(locks: CollaborationLock[], now = Date.now()): CollaborationLock[] {
  return locks.filter((lock) => lock.expiresAt > now);
}

export function hasValidLockToken(locks: CollaborationLock[], token: string, userId: string, now = Date.now()): boolean {
  return locks.some((lock) => lock.token === token && lock.ownerId === userId && lock.expiresAt > now);
}
