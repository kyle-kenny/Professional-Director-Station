import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { issueCollaborationToken } from '../server/auth.mjs';

const secret = 'pds-ci-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const dataDir = mkdtempSync(join(tmpdir(), 'pds-collab-smoke-'));

const project = {
  schemaVersion: 'pds-1', id: 'project-smoke', name: 'Original Project', updatedAt: '2026-09-07T00:00:00.000Z',
  coordinateConvention: { handedness: 'right', upAxis: 'Y', forwardAxis: '-Z', linearUnit: 'meter' },
  sequences: [{ id: 'seq-1', name: 'Sequence', shots: [{ id: 'shot-1', name: 'Shot', status: 'WIP', version: 1 }] }],
  assets: [], pipeline: {}, ai: { outputs: [] },
  collaboration: { revision: 0, members: [], comments: [], annotations: [], versions: [], approvals: [] },
};

const tokens = {
  owner: issueCollaborationToken({ sub: 'owner-1', name: 'Owner', projectId: project.id, role: 'owner', department: 'direction' }, secret, 3600),
  editor: issueCollaborationToken({ sub: 'editor-1', name: 'Editor', projectId: project.id, role: 'editor', department: 'editorial' }, secret, 3600),
  reviewer: issueCollaborationToken({ sub: 'reviewer-1', name: 'Reviewer', projectId: project.id, role: 'reviewer', department: 'review' }, secret, 3600),
};

class Session {
  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      const index = this.waiters.findIndex((item) => item.predicate(message));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else this.queue.push(message);
    });
  }

  send(message) { this.ws.send(JSON.stringify(message)); }

  next(predicate, timeoutMs = 5000) {
    const index = this.queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        const position = this.waiters.indexOf(waiter);
        if (position >= 0) this.waiters.splice(position, 1);
        reject(new Error('Timed out waiting for collaboration server message.'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  close() { this.ws.close(); }
}

async function connect(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, ['pds-v1', `pds-token.${token}`]);
  const session = new Session(ws);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket connection timed out.')), 5000);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  return session;
}

async function startServer() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const port = 26000 + Math.floor(Math.random() * 12000);
    const child = spawn(process.execPath, ['server/collab-server.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PDS_COLLAB_PORT: String(port), PDS_COLLAB_HOST: '127.0.0.1', PDS_AUTH_SECRET: secret, PDS_COLLAB_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Collaboration server start timed out. ${stderr}`)), 6000);
        const onData = (chunk) => {
          if (String(chunk).includes('PDS collaboration server listening')) {
            clearTimeout(timer);
            child.stdout.off('data', onData);
            resolve();
          }
        };
        child.stdout.on('data', onData);
        child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Collaboration server exited during startup (${code}). ${stderr}`)); });
      });
      return { child, port };
    } catch {
      try { child.kill(); } catch { /* ignore */ }
    }
  }
  throw new Error('Unable to start collaboration server on a free audit port.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Collaboration server did not stop cleanly.')), 5000)),
  ]);
}

let server;
try {
  server = await startServer();
  const owner = await connect(server.port, tokens.owner);
  const welcome = await owner.next((message) => message.type === 'welcome');
  if (welcome.project !== null || welcome.revision !== 0) throw new Error('Fresh room did not start empty at revision 0.');
  owner.send({ type: 'hello', project });
  const initialSnapshot = await owner.next((message) => message.type === 'snapshot');
  if (initialSnapshot.project?.name !== project.name) throw new Error('Owner failed to initialize authoritative project.');

  owner.send({ type: 'acquire-lock', scope: 'shot', targetId: 'shot-1', leaseMs: 30_000 });
  const lock = (await owner.next((message) => message.type === 'lock-acquired')).lock;
  const changed = structuredClone(project);
  changed.name = 'Persisted Project';
  changed.updatedAt = '2026-09-07T00:00:01.000Z';
  owner.send({ type: 'mutate', mutationId: 'owner-change', baseRevision: 0, project: changed, lockTokens: [lock.token] });
  const accepted = await owner.next((message) => message.type === 'accepted' && message.mutationId === 'owner-change');
  if (accepted.revision !== 1 || accepted.project?.name !== 'Persisted Project') throw new Error('Owner mutation was not accepted at revision 1.');
  let duplicateAck = false;
  try { await owner.next((message) => message.type === 'accepted' && message.mutationId === 'owner-change', 250); duplicateAck = true; } catch { /* expected timeout */ }
  if (duplicateAck) throw new Error('Mutation received duplicate accepted ACKs.');
  owner.close();
  await stopServer(server.child);

  server = await startServer();
  const editor = await connect(server.port, tokens.editor);
  const persistedWelcome = await editor.next((message) => message.type === 'welcome');
  if (persistedWelcome.revision !== 1 || persistedWelcome.project?.name !== 'Persisted Project') throw new Error('Server restart did not restore authoritative room state.');
  editor.send({ type: 'hello', project });
  const persistedSnapshot = await editor.next((message) => message.type === 'snapshot');
  if (persistedSnapshot.revision !== 1 || persistedSnapshot.project?.name !== 'Persisted Project') throw new Error('Stale editor hello replaced persisted authority.');

  const reviewer = await connect(server.port, tokens.reviewer);
  await reviewer.next((message) => message.type === 'welcome');
  reviewer.send({ type: 'hello', project });
  const reviewSnapshot = await reviewer.next((message) => message.type === 'snapshot');
  const withComment = structuredClone(reviewSnapshot.project);
  withComment.updatedAt = '2026-09-07T00:00:02.000Z';
  withComment.collaboration.comments.push({ id: 'comment-1', shotId: 'shot-1', frame: 0, authorId: 'reviewer-1', authorName: 'Reviewer', text: 'Frame note', createdAt: '2026-09-07T00:00:02.000Z' });
  reviewer.send({ type: 'mutate', mutationId: 'review-comment', baseRevision: 1, project: withComment, lockTokens: [] });
  const commentAccepted = await reviewer.next((message) => message.type === 'accepted' && message.mutationId === 'review-comment');
  if (commentAccepted.revision !== 2 || commentAccepted.project?.collaboration?.comments?.length !== 1) throw new Error('Reviewer comment-only mutation was rejected.');

  const editorRevision2 = await editor.next((message) => message.type === 'accepted' && message.revision === 2);
  const memberAttack = structuredClone(editorRevision2.project);
  memberAttack.collaboration.members.push({ userId: 'editor-1', displayName: 'Editor', role: 'owner', department: 'editorial', active: true });
  editor.send({ type: 'mutate', mutationId: 'member-attack', baseRevision: 2, project: memberAttack, lockTokens: [] });
  const memberConflict = await editor.next((message) => message.type === 'conflict' && message.mutationId === 'member-attack');
  if (memberConflict.reason !== 'members-permission-denied') throw new Error(`Unexpected member escalation result: ${memberConflict.reason}`);

  reviewer.close();
  editor.close();
  await stopServer(server.child);

  server = await startServer();
  const verify = await connect(server.port, tokens.owner);
  const finalWelcome = await verify.next((message) => message.type === 'welcome');
  if (finalWelcome.revision !== 2 || finalWelcome.project?.collaboration?.comments?.[0]?.text !== 'Frame note') throw new Error('Accepted reviewer mutation was not durable across restart.');
  verify.close();
  console.log('PDS collaboration server persistence/integration smoke PASSED');
} finally {
  if (server?.child && server.child.exitCode === null) {
    try { await stopServer(server.child); } catch { /* cleanup best effort */ }
  }
  rmSync(dataDir, { recursive: true, force: true });
}
