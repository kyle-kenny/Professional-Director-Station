import type { ProjectRole, ShotVersionRecord } from '../domain/collaboration';
import type { Shot } from '../domain/model';
import { can } from './authorization';
import { canonicalJson, sha256Text } from '../utils/sha256';

export type ShotStatus = Shot['status'];

const transitions: Record<ShotStatus, readonly ShotStatus[]> = {
  WIP: ['REVIEW'],
  REVIEW: ['WIP', 'APPROVED'],
  APPROVED: ['WIP'],
};

export function canTransitionShotStatus(from: ShotStatus, to: ShotStatus, role: ProjectRole): boolean {
  if (!transitions[from].includes(to)) return false;
  if (to === 'APPROVED') return can(role, 'review:approve');
  if (to === 'REVIEW') return can(role, 'review:submit');
  if (from === 'APPROVED' && to === 'WIP') return can(role, 'review:approve');
  return can(role, 'project:edit');
}

export function requireShotStatusTransition(from: ShotStatus, to: ShotStatus, role: ProjectRole): void {
  if (!canTransitionShotStatus(from, to, role)) throw new Error(`Role ${role} cannot transition shot ${from} → ${to}.`);
}

export function createImmutableShotVersion(shot: Shot, createdBy: string, now = new Date().toISOString()): ShotVersionRecord {
  const snapshotJson = canonicalJson(shot);
  const snapshotHashSha256 = sha256Text(snapshotJson);
  return {
    id: `${shot.id}:v${shot.version}:${snapshotHashSha256.slice(0, 12)}`,
    shotId: shot.id,
    version: shot.version,
    createdAt: now,
    createdBy,
    status: shot.status,
    snapshotHashSha256,
    snapshotJson,
  };
}

export function assertImmutableVersion(record: ShotVersionRecord): void {
  if (sha256Text(record.snapshotJson) !== record.snapshotHashSha256) {
    throw new Error(`Shot version ${record.id} failed SHA-256 integrity verification.`);
  }
}

export function restoreShotVersion(record: ShotVersionRecord): Shot {
  assertImmutableVersion(record);
  return JSON.parse(record.snapshotJson) as Shot;
}
