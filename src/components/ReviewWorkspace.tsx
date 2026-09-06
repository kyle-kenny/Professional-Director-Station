import { useEffect, useRef, useState } from 'react';
import type { ProjectMember, ProjectRole } from '../domain/collaboration';
import { useDirectorStore } from '../store/directorStore';
import { renderDirectorFrame } from '../rendering/directorFrameRenderer';
import { canTransitionShotStatus } from '../collab/reviewWorkflow';
import { getSessionIdentity, subscribeSessionIdentity, type SessionIdentity } from '../collab/sessionIdentity';
import {
  addFrameAnnotation,
  addReviewComment,
  captureActiveShotVersion,
  removeFrameAnnotation,
  resolveReviewComment,
  rollbackToShotVersion,
  transitionActiveShotStatus,
  upsertProjectMember,
} from '../store/reviewRegistry';
import { CollaborationPanel } from './CollaborationPanel';

const roles: ProjectRole[] = ['owner', 'director', 'editor', 'reviewer', 'viewer'];
const statuses = ['WIP', 'REVIEW', 'APPROVED'] as const;

export function ReviewWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useDirectorStore((state) => state.project);
  const shot = useDirectorStore((state) => state.getActiveShot());
  const playhead = useDirectorStore((state) => state.playhead);
  const setPlayheadFrame = useDirectorStore((state) => state.setPlayheadFrame);
  const frame = Math.round(playhead * shot.fps);
  const [identity, setIdentity] = useState<SessionIdentity>(getSessionIdentity());
  const [comment, setComment] = useState('');
  const [annotationMode, setAnnotationMode] = useState<'point' | 'box'>('point');
  const [member, setMember] = useState<ProjectMember>({ userId: '', displayName: '', role: 'editor', department: 'editorial', active: true });
  const [message, setMessage] = useState('');
  const comments = project.collaboration.comments.filter((item) => item.shotId === shot.id);
  const annotations = project.collaboration.annotations.filter((item) => item.shotId === shot.id && item.frame === frame);
  const versions = project.collaboration.versions.filter((item) => item.shotId === shot.id).sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt));
  const approvals = project.collaboration.approvals.filter((item) => item.shotId === shot.id).slice().reverse();

  useEffect(() => subscribeSessionIdentity(setIdentity), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderDirectorFrame(ctx, shot, frame, rect.width, rect.height);
      for (const item of annotations) {
        ctx.save();
        ctx.strokeStyle = '#ffcf66';
        ctx.fillStyle = 'rgba(255,207,102,.18)';
        ctx.lineWidth = 2;
        if (item.kind === 'point') {
          const point = item.points[0];
          const x = point.x * rect.width, y = point.y * rect.height;
          ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 16); ctx.stroke();
        } else if (item.kind === 'box' && item.points.length >= 2) {
          const [a, b] = item.points;
          const x = Math.min(a.x, b.x) * rect.width, y = Math.min(a.y, b.y) * rect.height;
          const w = Math.abs(a.x - b.x) * rect.width, h = Math.abs(a.y - b.y) * rect.height;
          ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [annotations, frame, shot]);

  const annotate = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    try {
      if (annotationMode === 'point') addFrameAnnotation({ kind: 'point', points: [{ x, y }], text: '' });
      else addFrameAnnotation({ kind: 'box', points: [{ x: Math.max(0, x - .06), y: Math.max(0, y - .06) }, { x: Math.min(1, x + .06), y: Math.min(1, y + .06) }], text: '' });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Annotation rejected'); }
  };

  const doTransition = (status: typeof statuses[number]) => {
    try { transitionActiveShotStatus(status); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Status transition rejected'); }
  };

  const addMember = () => {
    try {
      if (!member.userId.trim() || !member.displayName.trim()) throw new Error('Member ID and display name are required.');
      upsertProjectMember({ ...member, userId: member.userId.trim(), displayName: member.displayName.trim(), department: member.department.trim() || 'general' });
      setMember({ userId: '', displayName: '', role: 'editor', department: 'editorial', active: true });
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Member update rejected'); }
  };

  return <div className="review-page">
    <CollaborationPanel />
    <div className="review-grid">
      <section className="review-frame-card">
        <div className="review-toolbar"><span className="chip">FRAME REVIEW · F{frame}</span><button className={annotationMode === 'point' ? 'active' : ''} onClick={() => setAnnotationMode('point')}>Point</button><button className={annotationMode === 'box' ? 'active' : ''} onClick={() => setAnnotationMode('box')}>Box</button><span>点击画面添加归一化批注</span></div>
        <canvas ref={canvasRef} onClick={annotate} />
        <div className="annotation-list">{annotations.map((item) => <button key={item.id} onClick={() => removeFrameAnnotation(item.id)} title="删除自己创建的批注">{item.kind} · {item.id.slice(-8)} ×</button>)}</div>
      </section>

      <aside className="review-sidebar">
        <section>
          <div className="section-title">APPROVAL · {identity.role}</div>
          <strong>{shot.name} · v{shot.version}</strong>
          <div className="status-row">{statuses.map((status) => <button key={status} className={shot.status === status ? 'active' : ''} disabled={shot.status !== status && !canTransitionShotStatus(shot.status, status, identity.role)} onClick={() => doTransition(status)}>{status}</button>)}</div>
          <button className="wide" onClick={() => { try { const record = captureActiveShotVersion(); setMessage(`Frozen ${record.id}`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Version rejected'); } }}>Freeze immutable version</button>
        </section>

        <section>
          <div className="section-title">FRAME COMMENTS</div>
          <div className="review-compose"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={`Comment @ F${frame}`} /><button className="wide compact" onClick={() => { try { addReviewComment(comment); setComment(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Comment rejected'); } }}>Add</button></div>
          <div className="review-list">{comments.map((item) => <div key={item.id} className={item.resolvedAt ? 'resolved' : ''}><button onClick={() => setPlayheadFrame(item.frame)}>F{item.frame}</button><b>{item.authorName}</b><span>{item.text}</span>{!item.resolvedAt && <button onClick={() => resolveReviewComment(item.id)}>Resolve</button>}</div>)}</div>
        </section>

        <section>
          <div className="section-title">IMMUTABLE VERSIONS</div>
          <div className="version-list">{versions.map((version) => <div key={version.id}><b>v{version.version} · {version.status}</b><code>{version.snapshotHashSha256.slice(0, 12)}…</code><span>{version.createdBy}</span><button onClick={() => { try { rollbackToShotVersion(version.id); } catch (error) { setMessage(error instanceof Error ? error.message : 'Rollback rejected'); } }}>Rollback → new WIP</button></div>)}</div>
        </section>

        <section>
          <div className="section-title">PROJECT MEMBERS</div>
          <div className="member-list">{project.collaboration.members.map((item) => <div key={item.userId}><b>{item.displayName}</b><span>{item.department} · {item.role}{item.active ? '' : ' · disabled'}</span></div>)}</div>
          <div className="member-form"><input placeholder="user id" value={member.userId} onChange={(e) => setMember({ ...member, userId: e.target.value })} /><input placeholder="display name" value={member.displayName} onChange={(e) => setMember({ ...member, displayName: e.target.value })} /><select value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value as ProjectRole })}>{roles.map((role) => <option key={role}>{role}</option>)}</select><input placeholder="department" value={member.department} onChange={(e) => setMember({ ...member, department: e.target.value })} /><button className="wide compact" onClick={addMember}>Add / Update member</button></div>
        </section>

        <section>
          <div className="section-title">APPROVAL AUDIT</div>
          <div className="approval-list">{approvals.map((item) => <div key={item.id}><b>{item.from} → {item.to}</b><span>{item.actorName} · {new Date(item.at).toLocaleString()}</span><small>{item.note}</small></div>)}</div>
        </section>
        {message && <div className="collab-conflict">{message}</div>}
      </aside>
    </div>
  </div>;
}
