import type { ProjectRole } from '../domain/collaboration';

export type SessionIdentity = {
  userId: string;
  displayName: string;
  role: ProjectRole;
  department: string;
};

let identity: SessionIdentity = { userId: 'local-owner', displayName: 'Local Director', role: 'owner', department: 'direction' };
const listeners = new Set<(value: SessionIdentity) => void>();

export function getSessionIdentity(): SessionIdentity {
  return identity;
}

export function setSessionIdentity(next: SessionIdentity): void {
  identity = { ...next };
  for (const listener of listeners) listener(identity);
}

export function subscribeSessionIdentity(listener: (value: SessionIdentity) => void): () => void {
  listeners.add(listener);
  listener(identity);
  return () => { listeners.delete(listener); };
}
