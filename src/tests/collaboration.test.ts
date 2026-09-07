import { describe, expect, it } from 'vitest';
import { can } from '../collab/authorization';
import { acceptRevision, canAcquireLock, hasValidLockToken, pruneExpiredLocks, type CollaborationLock } from '../collab/protocol';
import { assertSecureCollaborationUrl, reconnectDelayMs } from '../collab/collaboration';

const lock = (overrides: Partial<CollaborationLock> = {}): CollaborationLock => ({
  token: 'token-1', scope: 'shot', targetId: 'shot-1', ownerId: 'editor-a', ownerName: 'Editor A', expiresAt: 10_000, ...overrides,
});

describe('Gate 3 authorization and concurrency protocol', () => {
  it('enforces role permissions without reviewer edit escalation', () => {
    expect(can('owner', 'members:manage')).toBe(true);
    expect(can('director', 'review:approve')).toBe(true);
    expect(can('editor', 'review:submit')).toBe(true);
    expect(can('editor', 'review:approve')).toBe(false);
    expect(can('reviewer', 'review:comment')).toBe(true);
    expect(can('reviewer', 'project:edit')).toBe(false);
    expect(can('viewer', 'review:comment')).toBe(false);
  });

  it('rejects stale revisions instead of silently overwriting', () => {
    expect(acceptRevision(4, 4)).toBe(5);
    expect(() => acceptRevision(3, 4)).toThrow(/stale revision/);
  });

  it('uses expiring ownership locks and validates lock tokens', () => {
    const locks = [lock()];
    expect(canAcquireLock(locks, 'shot', 'shot-1', 'editor-a', 5_000)).toBe(true);
    expect(canAcquireLock(locks, 'shot', 'shot-1', 'editor-b', 5_000)).toBe(false);
    expect(hasValidLockToken(locks, 'token-1', 'editor-a', 5_000)).toBe(true);
    expect(hasValidLockToken(locks, 'token-1', 'editor-b', 5_000)).toBe(false);
    expect(pruneExpiredLocks(locks, 10_001)).toEqual([]);
  });

  it('requires encrypted transport for non-local collaboration URLs', () => {
    expect(assertSecureCollaborationUrl('ws://127.0.0.1:8787')).toContain('ws://127.0.0.1:8787');
    expect(assertSecureCollaborationUrl('wss://studio.example/pds')).toBe('wss://studio.example/pds');
    expect(() => assertSecureCollaborationUrl('ws://studio.example/pds')).toThrow(/requires wss/);
    expect(() => assertSecureCollaborationUrl('https://studio.example/pds')).toThrow(/ws:\/\/ or wss:\/\//);
  });

  it('backs off reconnects with a hard upper bound', () => {
    expect(reconnectDelayMs(0)).toBe(500);
    expect(reconnectDelayMs(1)).toBe(1000);
    expect(reconnectDelayMs(20)).toBe(10_000);
  });
});
