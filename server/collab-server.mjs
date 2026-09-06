import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyCollaborationToken } from './auth.mjs';

const PORT = Number(process.env.PDS_COLLAB_PORT ?? 8787);
const SECRET = process.env.PDS_AUTH_SECRET ?? '';
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const DEFAULT_LEASE_MS = 30_000;
const MAX_LEASE_MS = 120_000;
const rooms = new Map();

const rolePermissions = {
  owner: new Set(['edit', 'lock', 'comment', 'submit', 'approve']),
  director: new Set(['edit', 'lock', 'comment', 'submit', 'approve']),
  editor: new Set(['edit', 'lock', 'comment', 'submit']),
  reviewer: new Set(['comment']),
  viewer: new Set(),
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
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

function roomFor(projectId) {
  let room = rooms.get(projectId);
  if (!room) {
    room = { projectId, revision: 0, project: null, clients: new Set(), presence: new Map(), locks: [] };
    rooms.set(projectId, room);
  }
  return room;
}

function pruneLocks(room, now = Date.now()) {
  const before = room.locks.length;
  room.locks = room.locks.filter((lock) => lock.expiresAt > now);
  if (room.locks.length !== before) broadcast(room, { type: 'locks', locks: room.locks });
}

function effectiveRole(room, identity) {
  const member = room.project?.collaboration?.members?.find((item) => item.userId === identity.sub && item.active !== false);
  return member?.role ?? identity.role;
}

function has(room, identity, permission) {
  return rolePermissions[effectiveRole(room, identity)]?.has(permission) ?? false;
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
  } catch (error) {
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
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { type: 'welcome', identity, revision: room.revision, project: room.project, locks: room.locks, presence: [...room.presence.values()] });

  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', code: 'invalid-json' }); return; }
    pruneLocks(room);

    if (message.type === 'hello') {
      if (message.project?.id !== identity.projectId) { send(ws, { type: 'error', code: 'project-scope-mismatch' }); return; }
      if (!room.project) {
        room.project = message.project;
        room.revision = Number(message.project?.collaboration?.revision ?? 0);
      }
      send(ws, { type: 'snapshot', revision: room.revision, project: room.project, locks: room.locks, presence: [...room.presence.values()] });
      return;
    }

    if (message.type === 'presence') {
      const presence = {
        userId: identity.sub, displayName: identity.name, role: effectiveRole(room, identity), department: identity.department ?? 'general',
        shotId: message.shotId, objectId: message.objectId, frame: Number.isInteger(message.frame) ? message.frame : undefined, lastSeenAt: Date.now(),
      };
      room.presence.set(identity.sub, presence);
      broadcast(room, { type: 'presence', presence: [...room.presence.values()] });
      return;
    }

    if (message.type === 'acquire-lock') {
      if (!has(room, identity, 'lock')) { send(ws, { type: 'lock-denied', reason: 'permission-denied', scope: message.scope, targetId: message.targetId }); return; }
      if (!['shot', 'object'].includes(message.scope) || !message.targetId) { send(ws, { type: 'error', code: 'invalid-lock' }); return; }
      const now = Date.now();
      const existing = room.locks.find((lock) => lock.scope === message.scope && lock.targetId === message.targetId && lock.expiresAt > now);
      if (existing && existing.ownerId !== identity.sub) { send(ws, { type: 'lock-denied', reason: 'owned-by-other', lock: existing }); return; }
      room.locks = room.locks.filter((lock) => !(lock.scope === message.scope && lock.targetId === message.targetId));
      const leaseMs = Math.min(MAX_LEASE_MS, Math.max(5_000, Number(message.leaseMs ?? DEFAULT_LEASE_MS)));
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
      if (!has(room, identity, 'edit')) { send(ws, { type: 'conflict', mutationId, reason: 'permission-denied', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }
      if (Number(message.baseRevision) !== room.revision) { send(ws, { type: 'conflict', mutationId, reason: 'stale-revision', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }
      if (!validOwnedLock(room, identity, Array.isArray(message.lockTokens) ? message.lockTokens : [])) { send(ws, { type: 'conflict', mutationId, reason: 'lock-required', expectedRevision: room.revision, receivedRevision: message.baseRevision, project: room.project }); return; }
      if (!message.project || message.project.id !== identity.projectId) { send(ws, { type: 'error', code: 'project-scope-mismatch' }); return; }
      room.revision += 1;
      message.project.collaboration = { ...(message.project.collaboration ?? {}), revision: room.revision };
      room.project = message.project;
      const accepted = { type: 'accepted', mutationId, revision: room.revision, project: room.project };
      broadcast(room, accepted);
      return;
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    room.presence.delete(identity.sub);
    room.locks = room.locks.filter((lock) => lock.ownerId !== identity.sub);
    broadcast(room, { type: 'presence', presence: [...room.presence.values()] });
    broadcast(room, { type: 'locks', locks: room.locks });
    if (!room.clients.size && !room.project) rooms.delete(room.projectId);
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

server.listen(PORT, () => console.log(`PDS collaboration server listening on http://127.0.0.1:${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
