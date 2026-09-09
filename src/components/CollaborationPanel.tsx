import { useEffect, useRef, useState } from 'react';
import { CollaborationSession } from '../collab/collaboration';
import { setSessionIdentity, type SessionIdentity } from '../collab/sessionIdentity';
import type { CollaborationLock, CollaborationPresence } from '../collab/protocol';
import { applyAuthoritativeProject } from '../store/reviewRegistry';
import { useDirectorStore } from '../store/directorStore';
import { timeToFrame } from '../editorial/timelineEngine';
import { roleZh } from '../i18n/zhCN';

const connectionZh = { connecting: '连接中', connected: '已连接', reconnecting: '正在重连', disconnected: '未连接', error: '连接错误' } as const;

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
  const [identity, setIdentity] = useState<SessionIdentity>({ userId: 'local-owner', displayName: '本机导演', role: 'owner', department: 'direction' });
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [locks, setLocks] = useState<CollaborationLock[]>([]);
  const [conflict, setConflict] = useState<string>('');
  const lastSyncedStamp = useRef(project.updatedAt);

  const connect = () => {
    setConflict(''); lastSyncedStamp.current = project.updatedAt;
    try {
      session.connectAuthenticated({
        url: url.trim(), token: token.trim(), project,
        callbacks: {
          onStatus: setStatus,
          onIdentity: (next) => { setIdentity(next); setSessionIdentity(next); },
          onPresence: setPresence, onLocks: setLocks,
          onConflict: (item) => setConflict(`${item.reason}：本地修订 r${item.receivedRevision} / 服务器修订 r${item.expectedRevision}。被拒绝的本地状态已回滚。`),
          onProject: (remote, revision) => { remote.collaboration.revision = revision; lastSyncedStamp.current = remote.updatedAt; applyAuthoritativeProject(remote); },
        },
      });
    } catch (error) {
      setStatus('error');
      setConflict(error instanceof Error ? error.message : '协作连接参数验证失败。');
    }
  };

  useEffect(() => {
    if (status !== 'connected' || project.updatedAt === lastSyncedStamp.current) return;
    const timer = window.setTimeout(() => { lastSyncedStamp.current = project.updatedAt; session.publishProject(project); }, 180);
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
    publish(); const heartbeat = window.setInterval(publish, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [activeShotId, playhead, selectedObjectId, session, shot.fps, status]);
  useEffect(() => () => session.disconnect(), [session]);

  const ownLock = locks.find((lock) => lock.scope === 'shot' && lock.targetId === activeShotId && lock.ownerId === identity.userId);
  const foreignLock = locks.find((lock) => lock.scope === 'shot' && lock.targetId === activeShotId && lock.ownerId !== identity.userId);

  return <section className="collab-panel">
    <div className="section-title">认证协作</div>
    <div className="collab-connect-row">
      <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="wss://studio.example/pds" aria-label="协作服务器地址" />
      <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="已签名的工程令牌" type="password" aria-label="已签名协作令牌" />
      {status === 'connected' ? <button className="wide compact" onClick={() => session.disconnect()}>断开连接</button> : <button className="wide compact" disabled={!token.trim()} onClick={connect}>连接</button>}
    </div>
    <div className="collab-status-row"><span className={`connection-state ${status}`}>{connectionZh[status]}</span><strong>{identity.displayName}</strong><span>{roleZh[identity.role]}</span><span>部门：{identity.department}</span><span>工程修订 r{project.collaboration.revision}</span></div>
    <div className="meta">签名令牌限定工程范围并规定权限上限；成员表只能降权，不能把令牌提升为更高角色。远程连接必须使用 wss://，本机开发允许 ws://127.0.0.1 / localhost。当前镜头使用 45 秒租约锁，每 20 秒自动续租。</div>
    {ownLock && <div className="collab-ok">镜头锁 · 当前用户持有 · 到期 {new Date(ownLock.expiresAt).toLocaleTimeString()}</div>}
    {foreignLock && <div className="collab-conflict">镜头已被 {foreignLock.ownerName} 锁定</div>}
    {conflict && <div className="collab-conflict">{conflict}</div>}
    <div className="presence-list">{presence.map((person) => <div key={person.userId}><b>{person.displayName}</b><span>{person.department} · {roleZh[person.role]}</span><span>{person.shotId ?? '未进入镜头'} · 第 {person.frame ?? 0} 帧</span></div>)}</div>
  </section>;
}
