import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { canTransitionShotStatus, createImmutableShotVersion, restoreShotVersion } from '../collab/reviewWorkflow';
import { sha256Text } from '../utils/sha256';

describe('Gate 3 review workflow', () => {
  it('matches SHA-256 reference vectors', () => {
    expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('restricts approval and approved-shot reopen to director/owner authority', () => {
    expect(canTransitionShotStatus('WIP', 'REVIEW', 'editor')).toBe(true);
    expect(canTransitionShotStatus('WIP', 'APPROVED', 'owner')).toBe(false);
    expect(canTransitionShotStatus('REVIEW', 'APPROVED', 'editor')).toBe(false);
    expect(canTransitionShotStatus('REVIEW', 'APPROVED', 'director')).toBe(true);
    expect(canTransitionShotStatus('APPROVED', 'WIP', 'editor')).toBe(false);
    expect(canTransitionShotStatus('APPROVED', 'WIP', 'director')).toBe(true);
    expect(canTransitionShotStatus('APPROVED', 'WIP', 'owner')).toBe(true);
  });

  it('freezes immutable shot snapshots and detects tampering before restore', () => {
    const shot = createDefaultProject().sequences[0].shots[0];
    shot.status = 'REVIEW';
    const record = createImmutableShotVersion(shot, 'director-1', '2026-09-07T00:00:00.000Z');
    expect(record.snapshotHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(restoreShotVersion(record)).toEqual(shot);
    expect(() => restoreShotVersion({ ...record, snapshotJson: record.snapshotJson.replace('SHOT 001A', 'TAMPERED') })).toThrow(/integrity/);
  });
});
