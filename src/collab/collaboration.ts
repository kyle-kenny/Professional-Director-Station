import * as Y from 'yjs';
import { projectSchema, type DirectorProject } from '../domain/model';
import type { CollaborationLock, CollaborationPresence, LockScope, ServerConflict } from './protocol';
import type { SessionIdentity } from './sessionIdentity';

export type CollaborationCallbacks = {
  onProject?: (project: DirectorProject, revision: number, source: 'snapshot' | 'accepted' | 'conflict') => void;
  onConflict?: (conflict: ServerConflict) => void;
  onPresence?: (presence: CollaborationPresence[]) => void;
  onLocks?: (locks: CollaborationLock[]) => void;
  onIdentity?: (identity: SessionIdentity) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error') => void;
};

type ConnectOptions = { url: string; token: string; project: DirectorProject; callbacks?: CollaborationCallbacks };

export function assertSecureCollaborationUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('Collaboration URL must use ws:// or wss://.');
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'ws:' && !local) throw new Error('Remote collaboration requires wss:// so signed tokens are not sent over plaintext transport.');
  return url.toString();
}

function parseRemoteProject(value: unknown): DirectorProject {
  return projectSchema.parse(value);
}

export class CollaborationSession {
  readonly doc = new Y.Doc();
  readonly projectMap = this.doc.getMap<string>('project');
  private channel?: BroadcastChannel;
  private socket?: WebSocket;
  private options?: ConnectOptions;
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private revision = 0;
  private locks: CollaborationLock[] = [];
  private heldLockTokens = new Set<string>();
  private presence: CollaborationPresence[] = [];
  private pendingMutationId?: string;
  private queuedProject?: DirectorProject;

  get currentRevision() { return this.revision; }
  get currentLocks() { return [...this.locks]; }
  get currentPresence() { return [...this.presence]; }
  get connected() { return this.socket?.readyState === WebSocket.OPEN; }

  connectAuthenticated(options: ConnectOptions) {
    this.disconnectSocket(false);
    this.options = { ...options, url: assertSecureCollaborationUrl(options.url), project: projectSchema.parse(options.project) };
    this.intentionalClose = false;
    this.revision = this.options.project.collaboration.revision;
    options.callbacks?.onStatus?.('connecting');
    this.openSocket();
  }

  private openSocket() {
    const options = this.options;
    if (!options || typeof WebSocket === 'undefined') { options?.callbacks?.onStatus?.('error'); return; }
    const socket = new WebSocket(options.url, ['pds-v1', `pds-token.${options.token}`]);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectAttempt = 0;
      options.callbacks?.onStatus?.('connected');
      socket.send(JSON.stringify({ type: 'hello', project: options.project }));
    };
    socket.onmessage = (event) => {
      try { this.handleServerMessage(JSON.parse(String(event.data)) as Record<string, any>); }
      catch { options.callbacks?.onStatus?.('error'); }
    };
    socket.onerror = () => options.callbacks?.onStatus?.('error');
    socket.onclose = () => {
      if (this.socket === socket) this.socket = undefined;
      this.pendingMutationId = undefined;
      options.callbacks?.onStatus?.(this.intentionalClose ? 'disconnected' : 'reconnecting');
      if (!this.intentionalClose) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.options || this.reconnectTimer !== undefined || this.intentionalClose) return;
    const delay = reconnectDelayMs(this.reconnectAttempt++);
    this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = undefined; this.openSocket(); }, delay);
  }

  private handleServerMessage(message: Record<string, any>) {
    const callbacks = this.options?.callbacks;
    if (message.type === 'welcome' && message.identity) {
      callbacks?.onIdentity?.({ userId: message.identity.sub, displayName: message.identity.name, role: message.identity.role, department: message.identity.department ?? 'general' });
      this.revision = Number(message.revision ?? 0);
      this.replaceLocks(message.locks ?? []);
      this.replacePresence(message.presence ?? []);
      if (message.project) callbacks?.onProject?.(parseRemoteProject(message.project), this.revision, 'snapshot');
      return;
    }
    if (message.type === 'snapshot') {
      this.revision = Number(message.revision ?? 0);
      this.replaceLocks(message.locks ?? []);
      this.replacePresence(message.presence ?? []);
      if (message.project) callbacks?.onProject?.(parseRemoteProject(message.project), this.revision, 'snapshot');
      return;
    }
    if (message.type === 'accepted') {
      this.revision = Number(message.revision ?? this.revision + 1);
      if (message.mutationId === this.pendingMutationId) this.pendingMutationId = undefined;
      if (message.project) callbacks?.onProject?.(parseRemoteProject(message.project), this.revision, 'accepted');
      this.flushQueuedMutation();
      return;
    }
    if (message.type === 'conflict') {
      const conflict = message as ServerConflict;
      this.revision = conflict.expectedRevision;
      this.pendingMutationId = undefined;
      this.queuedProject = undefined;
      callbacks?.onConflict?.(conflict);
      if (conflict.project) callbacks?.onProject?.(parseRemoteProject(conflict.project), conflict.expectedRevision, 'conflict');
      return;
    }
    if (message.type === 'presence') { this.replacePresence(message.presence ?? []); return; }
    if (message.type === 'locks') { this.replaceLocks(message.locks ?? []); return; }
    if (message.type === 'lock-acquired' && message.lock) {
      this.heldLockTokens.add(message.lock.token);
      this.replaceLocks([...this.locks.filter((lock) => !(lock.scope === message.lock.scope && lock.targetId === message.lock.targetId)), message.lock]);
    }
  }

  private replaceLocks(locks: CollaborationLock[]) {
    this.locks = locks;
    const activeTokens = new Set(locks.map((lock) => lock.token));
    for (const token of this.heldLockTokens) if (!activeTokens.has(token)) this.heldLockTokens.delete(token);
    this.options?.callbacks?.onLocks?.([...locks]);
  }

  private replacePresence(presence: CollaborationPresence[]) {
    this.presence = presence;
    this.options?.callbacks?.onPresence?.([...presence]);
  }

  acquireLock(scope: LockScope, targetId: string, leaseMs = 30_000) { this.send({ type: 'acquire-lock', scope, targetId, leaseMs }); }
  releaseLock(token: string) { this.heldLockTokens.delete(token); this.send({ type: 'release-lock', token }); }

  publishProject(project: DirectorProject) {
    const validated = projectSchema.parse(project);
    this.projectMap.set('json', JSON.stringify(validated));
    if (!this.connected) { this.channel?.postMessage({ type: 'project', project: validated }); return; }
    if (this.pendingMutationId) { this.queuedProject = structuredClone(validated); return; }
    this.sendMutation(validated);
  }

  private sendMutation(project: DirectorProject) {
    const mutationId = crypto.randomUUID();
    this.pendingMutationId = mutationId;
    this.send({ type: 'mutate', mutationId, baseRevision: this.revision, project, lockTokens: [...this.heldLockTokens] });
  }

  private flushQueuedMutation() {
    if (!this.connected || this.pendingMutationId || !this.queuedProject) return;
    const project = this.queuedProject;
    this.queuedProject = undefined;
    project.collaboration.revision = this.revision;
    this.sendMutation(project);
  }

  updatePresence(shotId?: string, objectId?: string, frame?: number) { this.send({ type: 'presence', shotId, objectId, frame }); }
  private send(message: unknown) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }

  connectRoom(roomId: string, onRemoteProject: (project: DirectorProject) => void) {
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel?.close();
    this.channel = new BroadcastChannel(`pds:${roomId}`);
    this.channel.onmessage = (event) => { if (event.data?.type === 'project') { const parsed = projectSchema.safeParse(event.data.project); if (parsed.success) onRemoteProject(parsed.data); } };
  }

  private disconnectSocket(intentional = true) {
    this.intentionalClose = intentional;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close();
    this.socket = undefined;
    this.pendingMutationId = undefined;
    this.queuedProject = undefined;
  }

  disconnect() {
    this.disconnectSocket(true);
    this.channel?.close();
    this.channel = undefined;
    this.heldLockTokens.clear();
    this.locks = [];
    this.presence = [];
    this.doc.destroy();
    this.options?.callbacks?.onStatus?.('disconnected');
  }
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(10_000, 500 * 2 ** Math.min(5, Math.max(0, attempt)));
}
