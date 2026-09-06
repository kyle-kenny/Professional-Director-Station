import { useEffect, useRef, useState } from 'react';
import { CollaborationSession } from '../collab/collaboration';
import { setSessionIdentity, type SessionIdentity } from '../collab/sessionIdentity';
import type { CollaborationLock, CollaborationPresence } from '../collab/protocol';
import { applyAuthoritativeProject } from '../store/reviewRegistry';
import { useDirectorStore } from '../store/directorStore';
import { timeToFrame } from '../editorial/timelineEngine';

export function CollaborationPanel() {
  const project = useDirectorStore((state) => state.project);
  const activeShotId = useDirectorStore((state) => state.activeShotId);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const playhead = useDirectorStore((state) => state.playhead);
  const shot = useDirectorStore((state) => state.getActiveShot());
  const sessionRef = useRef<CollaborationSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new CollaborationSession();
  const session = sessionRef.current;
  const [url, setUrl] = useState('ws://127.0.0.1:8787');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'>('disconnected');
  const [identity, setIdentity] = useState<SessionIdentity>({ userId: 'local-owner', displayName: 'Local Director', role: 'owner', department: 'direction' });
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [locks, setLocks] = useState<CollaborationLock[]>([]);
  const [conflict, setConflict] = useState<string>('');
  const lastSyncedStamp = useRef(project.updatedAt);

  const connect = () => {
    setConflict('');
    lastSyncedStamp.current = project.updatedAt;
    session.connectAuthenticated({
      url: url.trim(), token: token.trim(), project,
      callbacks: {
        onStatus: setStatus,
        onIdentity: (next) => { setIdentity(next); setSessionIdentity(next); },
        onPresence: setPresence,
        onLocks: setLocks,
        onConflict: (item) => setConflict(`${item.reason}: local r${item.receivedRevision} / server r${item.expectedRevision}. Local rejected state was rolled back.`),
        onProject: (remote, revision) => {
          remote.collaboration.revision = revision;
          lastSyncedStamp.current = remote.updatedAt;
          applyAuthoritativeProject(remote);
        },
      },
    });
  };

  useEffect(() => {
    if (status !== 'connected' || project.updatedAt === lastSyncedStamp.current) return;
    const timer = window.setTimeout(() => {
      lastSyncedStamp.current = project.updatedAt;
      session.publishProject(project);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [project, session, status]);

  useEffect(() => {
    if (status !== 'connected') return;
    session.acquireLock('shot', activeShotId, 45_000);
    const lease = window.setInterval(() => session.acquireLock('shot', activeShotId, 45_000), 20_000);
    return () => window.clearInterval(lease);
  }, [activeShotId, session, status]);

  useEffect(() => {
    if (status !== 'connected') return;
    const publish = () => session.updatePresence(activeShotId, selectedObjectId, timeToFrame(playhead, shot.fps));
    publish();
    const heartbeat = window.setInterval(publish, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [activeShotId, playhead, selectedObjectId, session, shot.fps, status]);

  useEffect(() => () => session.disconnect(), [session]);

  const ownLock = locks.find((lock) => lock.scope === 'shot' && lock.targetId === activeShotId && lock.ownerId === identity.userId);
  const foreignLock = locks.find((lock) => lock.scope === 'shot' && lock.targetId === activeShotId && lock.ownerId !== identity.userId);

  return <section className="collab-panel">
    <div className="section-title">AUTHENTICATED COLLABORATION</div>
    <div className="collab-connect-row">
      <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="wss://studio.example/pds" aria-label="Collaboration server URL" />
      <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Signed project token" type="password" aria-label="Signed collaboration token" />
      {status === 'connected' ? <button className="wide compact" onClick={() => session.disconnect()}>Disconnect</button> : <button className="wide compact" disabled={!token.trim()} onClick={connect}>Connect</button>}
    </div>
    <div className="collab-status-row"><span className={`connection-state ${status}`}>{status}</span><strong>{identity.displayName}</strong><span>{identity.role}</span><span>{identity.department}</span><span>revision {project.collaboration.revision}</span></div>
    <div className="meta">服务端 token 决定 project scope 与身份；项目成员表决定实际角色权限。当前 Shot 使用 45 秒租约锁，每 20 秒续租。</div>
    {ownLock && <div className="collab-ok">SHOT LOCK · owned · expires {new Date(ownLock.expiresAt).toLocaleTimeString()}</div>}
    {foreignLock && <div className="collab-conflict">SHOT LOCKED BY {foreignLock.ownerName}</div>}
    {conflict && <div className="collab-conflict">{conflict}</div>}
    <div className="presence-list">{presence.map((person) => <div key={person.userId}><b>{person.displayName}</b><span>{person.department} · {person.role}</span><span>{person.shotId ?? '—'} · F{person.frame ?? 0}</span></div>)}</div>
  </section>;
}
