import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyCollaborationToken } from './auth.mjs';
import { canInitializeProjectRoom, effectiveProjectRole, hasProjectPermission } from './authorization.mjs';
import { authorizeProjectMutation } from './project-policy.mjs';

const PORT = Number(process.env.PDS_COLLAB_PORT ?? 8787);
const HOST = process.env.PDS_COLLAB_HOST ?? '127.0.0.1';
const SECRET = process.env.PDS_AUTH_SECRET ?? '';
const DATA_DIR = process.env.PDS_COLLAB_DATA_DIR ?? '.pds-collab-data';
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_MESSAGES_PER_10S = 240;
const DEFAULT_LEASE_MS = 30_000;
const MAX_LEASE_MS = 120_000;
const rooms = new Map();
mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const storageErrors = [...rooms.values()].filter((room) => room.storageError).length;
    res.writeHead(storageErrors ? 503 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: storageErrors === 0, rooms: rooms.size, storageErrors }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not-found' }));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, handleProtocols: (protocols) => protocols.has('pds-v1') ? 'pds-v1' : false });

function tokenFromProtocols(header = '') {
  const parts = header.split(',').map((part) => part.trim());
  const tokenProtocol = parts.find((part) => part.startsWith('pds-token.'));
  return tokenProtocol?.slice('pds-token.'.length);
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, except) {
  for (const client of room.clients) if (client !== except) send(client, payload);
}

function validProjectEnvelope(project, projectId) {
  if (!project || project.schemaVersion !== 'pds-1' || project.id !== projectId) return false;
  if (project.coordinateConvention?.handedness !== 'right' || project.coordinateConvention?.upAxis !== 'Y' || project.coordinateConvention?.forwardAxis !== '-Z' || project.coordinateConvention?.linearUnit !== 'meter') return false;
  if (!Array.isArray(project.sequences) || project.sequences.length < 1 || !project.sequences.every((sequence) => sequence && typeof sequence.id === 'string' && Array.isArray(sequence.shots) && sequence.shots.length > 0)) return false;
  if (!Array.isArray(project.assets)) return false;
  const collaboration = project.collaboration;
  if (!collaboration || typeof collaboration !== 'object') return false;
  for (const key of ['members', 'comments', 'annotations', 'versions', 'approvals']) if (!Array.isArray(collaboration[key])) return false;
  if (!project.pipeline || typeof project.pipeline !== 'object' || !project.ai || typeof project.ai !== 'object' || !Array.isArray(project.ai.outputs)) return false;
  return true;
}

function statePath(projectId) {
  const digest = createHash('sha256').update(projectId).digest('hex');
  return join(DATA_DIR, `${digest}.json`);
}

function persistProjectState(projectId, revision, project) {
  const target = statePath(projectId);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const body = `${JSON.stringify({ projectId, revision, project })}\n`;
  try {
    writeFileSync(temp, body, { encoding: 'utf8', mode: 0o600, flush: true });
    renameSync(temp, target);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* ignore temp cleanup failure */ }
    throw error;
  }
}

function loadProjectState(projectId) {
  try {
    const parsed = JSON.parse(readFileSync(statePath(projectId), 'utf8'));
    if (parsed.projectId !== projectId || !Number.isInteger(parsed.revision) || parsed.revision < 0 || !validProjectEnvelope(parsed.project, projectId)) throw new Error('Persisted collaboration room failed validation.');
    parsed.project.collaboration.revision = parsed.revision;
    return { revision: parsed.revision, project: parsed.project, storageError: undefined };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return { revision: 0, project: null, storageError: undefined };
    return { revision: 0, project: null, storageError: error instanceof Error ? error.message : 'unknown-storage-error' };
  }
}

function roomFor(projectId) {
  let room = rooms.get(projectId);
  if (!room) {
    const persisted = loadProjectState(projectId);
    room = { projectId, revision: persisted.revision, project: persisted.project, storageError: persisted.storageError, clients: new Set(), presence: new Map(), locks: [] };
    rooms.set(projectId, room);
  }
  return room;
}

function pruneLocks(room, now = Date.now()) {
  const before = room.locks.length;
  room.locks = room.locks.filter((lock) => lock.expiresAt > now);
  if (room.locks.length !== before) broadcast(room, { type: 'locks', locks: room.locks });
}

function memberRole(room, identity) {
  return room.project?.collaboration?.members?.find((item) => item.userId === identity.sub && item.active !== false)?.role;
}

function effectiveRole(room, identity) {
  return effectiveProjectRole(identity.role, memberRole(room, identity));
}

function has(room, identity, permission) {
  return hasProjectPermission(identity.role, memberRole(room, identity), permission);
}

function validOwnedLock(room, identity, tokens) {
  const now = Date.now();
  return room.locks.some((lock) => tokens.includes(lock.token) && lock.ownerId === identity.sub && lock.expiresAt > now);
}

server.on('upgrade', (req, socket, head) => {
  try {
    const token = tokenFromProtocols(req.headers['sec-websocket-protocol']);
    const identity = verifyCollaborationToken(token, SECRET);
    req.pdsIdentity = identity;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.pdsIdentity = identity;
      wss.emit('connection', ws, req);
    });
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const identity = ws.pdsIdentity;
  const room = roomFor(identity.projectId);
  room.clients.add(ws);
  ws.room = room;
  ws.isAlive = true;
  ws.rateWindowStartedAt = Date.now();
  ws.rateMessageCount = 0;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { type: 'welcome', identity: { ...identity, role: effectiveRole(room, identity) }, revision: room.revision, project: room.project, locks: room.locks, presence: [...room.presence.values()], storageError: room.storageError });

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - ws.rateWindowStartedAt >= 10_000) { ws.rateWindowStartedAt = now; ws.rateMessageCount = 0; }
    ws.rateMessageCount += 1;
    if (ws.rateMessageCount > MAX_MESSAGES_PER_10S) { send(ws, { type: 'error', code: 'rate-limit' }); ws.close(1008, 'rate-limit'); return; }

    let message;
    try { message = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', code: 'invalid-json' }); return; }
    pruneLocks(room);
    if (room.storageError) { send(ws, { type: 'error', code: 'storage-corrupt', message: room.storageError }); return; }

    if (message.type === 'hello') {
      if (!validProjectEnvelope(message.project, identity.projectId)) { send(ws, { type: 'error', code: 'invalid-project-envelope' }); return; }
      if (!room.project) {
        if (!canInitializeProjectRoom(identity.role)) { send(ws, { type: 'error', code: 'initialization-permission-denied' }); return; }
        const initialRevision = Number(message.project?.collaboration?.revision ?? 0);
        if (!Number.isInteger(initialRevision) || initialRevision < 0) { send(ws, { type: 'error', code: 'invalid-project-revision' }); return; }
        const initialProject = structuredClone(message.project);
        initialProject.collaboration.revision = initialRevision;
        try { persistProjectState(identity.projectId, initialRevision, initialProject); }
        catch { send(ws, { type: 'error', code: 'storage-write-failed' }); return; }
        room.project = initialProject;
        room.revision = initialRevision;
      }
      send(ws, { type: 'snapshot', revision: room.revision, project: room.project, locks: room.locks, presence: [...room.presence.values()] });
      return;
    }

    if (message.type === 'presence') {
      const presence = {
        userId: identity.sub, displayName: identity.name, role: effectiveRole(room, identity), department: identity.department ?? 'general',
        shotId: typeof message.shotId === 'string' ? message.shotId : undefined,
        objectId: typeof message.objectId === 'string' ? message.objectId : undefined,
        frame: Number.isInteger(message.frame) ? message.frame : undefined,
        lastSeenAt: Date.now(),
      };
      room.presence.set(identity.sub, presence);
      broadcast(room, { type: 'presence', presence: [...room.presence.values()] });
      return;
    }

    if (message.type === 'acquire-lock') {
      if (!has(room, identity, 'lock')) { send(ws, { type: 'lock-denied', reason: 'permission-denied', scope: message.scope, targetId: message.targetId }); return; }
      if (!['shot', 'object'].includes(message.scope) || typeof message.targetId !== 'string' || !message.targetId) { send(ws, { type: 'error', code: 'invalid-lock' }); return; }
      const now = Date.now();
      const existing = room.locks.find((lock) => lock.scope === message.scope && lock.targetId === message.targetId && lock.expiresAt > now);
      if (existing && existing.ownerId !== identity.sub) { send(ws, { type: 'lock-denied', reason: 'owned-by-other', lock: existing }); return; }
      room.locks = room.locks.filter((lock) => !(lock.scope === message.scope && lock.targetId === message.targetId));
      const requestedLease = Number(message.leaseMs ?? DEFAULT_LEASE_MS);
      const leaseMs = Number.isFinite(requestedLease) ? Math.min(MAX_LEASE_MS, Math.max(5_000, requestedLease)) : DEFAULT_LEASE_MS;
      const lock = { token: randomUUID(), scope: message.scope, targetId: message.targetId, ownerId: identity.sub, ownerName: identity.name, expiresAt: now + leaseMs };
      room.locks.push(lock);
      broadcast(room, { type: 'locks', locks: room.locks });
      send(ws, { type: 'lock-acquired', lock });
      return;
    }

    if (message.type === 'release-lock') {
      room.locks = room.locks.filter((lock) => !(lock.token === message.token && lock.ownerId === identity.sub));
      broadcast(room, { type: 'locks', locks: room.locks });
      return;
    }

    if (message.type === 'mutate') {
      const mutationId = String(message.mutationId ?? 'unknown');
      if (Number(message.baseRevision) !== room.revision) { send(ws, { type: 'conflict', mutationId, reason: 'stale-revision', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }
      if (!validProjectEnvelope(message.project, identity.projectId)) { send(ws, { type: 'error', code: 'invalid-project-envelope' }); return; }
      if (!room.project) { send(ws, { type: 'error', code: 'room-not-initialized' }); return; }
      const role = effectiveRole(room, identity);
      const policy = authorizeProjectMutation(room.project, message.project, identity, role);
      if (!policy.ok) { send(ws, { type: 'conflict', mutationId, reason: policy.reason ?? 'permission-denied', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }
      if (policy.requiresLock && !validOwnedLock(room, identity, Array.isArray(message.lockTokens) ? message.lockTokens : [])) { send(ws, { type: 'conflict', mutationId, reason: 'lock-required', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }

      const nextRevision = room.revision + 1;
      const nextProject = structuredClone(message.project);
      nextProject.collaboration.revision = nextRevision;
      try { persistProjectState(identity.projectId, nextRevision, nextProject); }
      catch { send(ws, { type: 'conflict', mutationId, reason: 'storage-write-failed', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }
      room.revision = nextRevision;
      room.project = nextProject;
      const accepted = { type: 'accepted', mutationId, revision: room.revision, project: room.project };
      broadcast(room, accepted, ws);
      send(ws, accepted);
      return;
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    room.presence.delete(identity.sub);
    room.locks = room.locks.filter((lock) => lock.ownerId !== identity.sub);
    broadcast(room, { type: 'presence', presence: [...room.presence.values()] });
    broadcast(room, { type: 'locks', locks: room.locks });
    if (!room.clients.size) rooms.delete(room.projectId);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  for (const room of rooms.values()) pruneLocks(room);
}, 15_000);
heartbeat.unref();

server.listen(PORT, HOST, () => console.log(`PDS collaboration server listening on http://${HOST}:${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
