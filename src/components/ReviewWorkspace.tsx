import { useEffect, useRef, useState } from 'react';
import type { ProjectMember, ProjectRole } from '../domain/collaboration';
import { useDirectorStore } from '../store/directorStore';
import { renderDirectorFrame } from '../rendering/directorFrameRenderer';
import { fitAspectRect } from '../utils/math';
import { canTransitionShotStatus } from '../collab/reviewWorkflow';
import { getSessionIdentity, subscribeSessionIdentity, type SessionIdentity } from '../collab/sessionIdentity';
import { addFrameAnnotation, addReviewComment, captureActiveShotVersion, removeFrameAnnotation, resolveReviewComment, rollbackToShotVersion, transitionActiveShotStatus, upsertProjectMember } from '../store/reviewRegistry';
import { CollaborationPanel } from './CollaborationPanel';
import { roleZh, shotStatusZh } from '../i18n/zhCN';

const roles: ProjectRole[] = ['owner', 'director', 'editor', 'reviewer', 'viewer'];
const statuses = ['WIP', 'REVIEW', 'APPROVED'] as const;
const annotationZh = { point: '点批注', box: '框选批注', freehand: '手绘批注' } as const;

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
      const frameRect = fitAspectRect(rect.width, rect.height, shot.frameAspect);
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); renderDirectorFrame(ctx, shot, frame, rect.width, rect.height);
      for (const item of annotations) {
        ctx.save(); ctx.strokeStyle = '#ffcf66'; ctx.fillStyle = 'rgba(255,207,102,.18)'; ctx.lineWidth = 2;
        if (item.kind === 'point') {
          const point = item.points[0]; const x = frameRect.x + point.x * frameRect.width, y = frameRect.y + point.y * frameRect.height;
          ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.moveTo(x, y - 16); ctx.lineTo(x, y + 16); ctx.stroke();
        } else if (item.kind === 'box' && item.points.length >= 2) {
          const [a, b] = item.points; const x = frameRect.x + Math.min(a.x, b.x) * frameRect.width, y = frameRect.y + Math.min(a.y, b.y) * frameRect.height; const w = Math.abs(a.x - b.x) * frameRect.width, h = Math.abs(a.y - b.y) * frameRect.height; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
      }
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas); return () => observer.disconnect();
  }, [annotations, frame, shot]);

  const annotate = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); const frameRect = fitAspectRect(rect.width, rect.height, shot.frameAspect); const localX = event.clientX - rect.left; const localY = event.clientY - rect.top;
    if (localX < frameRect.x || localX > frameRect.x + frameRect.width || localY < frameRect.y || localY > frameRect.y + frameRect.height) { setMessage('批注只能添加在有效镜头画幅内。'); return; }
    const x = Math.min(1, Math.max(0, (localX - frameRect.x) / frameRect.width)); const y = Math.min(1, Math.max(0, (localY - frameRect.y) / frameRect.height));
    try {
      if (annotationMode === 'point') addFrameAnnotation({ kind: 'point', points: [{ x, y }], text: '' });
      else addFrameAnnotation({ kind: 'box', points: [{ x: Math.max(0, x - .06), y: Math.max(0, y - .06) }, { x: Math.min(1, x + .06), y: Math.min(1, y + .06) }], text: '' });
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : '批注被拒绝。'); }
  };
  const doTransition = (status: typeof statuses[number]) => { try { transitionActiveShotStatus(status); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : '状态流转被拒绝。'); } };
  const addMember = () => {
    try {
      if (!member.userId.trim() || !member.displayName.trim()) throw new Error('成员 ID 和显示名称不能为空。');
      upsertProjectMember({ ...member, userId: member.userId.trim(), displayName: member.displayName.trim(), department: member.department.trim() || 'general' });
      setMember({ userId: '', displayName: '', role: 'editor', department: 'editorial', active: true }); setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : '成员更新被拒绝。'); }
  };

  return <div className="review-page">
    <CollaborationPanel />
    <div className="review-grid">
      <section className="review-frame-card">
        <div className="review-toolbar"><span className="chip">逐帧审片 · 第 {frame} 帧</span><button className={annotationMode === 'point' ? 'active' : ''} onClick={() => setAnnotationMode('point')}>点批注</button><button className={annotationMode === 'box' ? 'active' : ''} onClick={() => setAnnotationMode('box')}>框选批注</button><span>点击有效画幅添加归一化批注；黑边不接受批注</span></div>
        <canvas ref={canvasRef} onClick={annotate} />
        <div className="annotation-list">{annotations.map((item) => <button key={item.id} onClick={() => removeFrameAnnotation(item.id)} title="删除自己创建的批注">{annotationZh[item.kind]} · {item.id.slice(-8)} ×</button>)}</div>
      </section>

      <aside className="review-sidebar">
        <section>
          <div className="section-title">审批 · 当前身份：{roleZh[identity.role]}</div>
          <strong>{shot.name} · v{shot.version}</strong>
          <div className="status-row">{statuses.map((status) => <button key={status} aria-label={status} className={shot.status === status ? 'active' : ''} disabled={shot.status !== status && !canTransitionShotStatus(shot.status, status, identity.role)} onClick={() => doTransition(status)}>{shotStatusZh[status]}</button>)}</div>
          <button className="wide" onClick={() => { try { const record = captureActiveShotVersion(); setMessage(`已冻结不可变版本 ${record.id}`); } catch (error) { setMessage(error instanceof Error ? error.message : '版本冻结被拒绝。'); } }}>冻结不可变版本</button>
        </section>

        <section>
          <div className="section-title">逐帧评论</div>
          <div className="review-compose"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={`第 ${frame} 帧添加评论`} /><button className="wide compact" onClick={() => { try { addReviewComment(comment); setComment(''); } catch (error) { setMessage(error instanceof Error ? error.message : '评论被拒绝。'); } }}>添加</button></div>
          <div className="review-list">{comments.map((item) => <div key={item.id} className={item.resolvedAt ? 'resolved' : ''}><button onClick={() => setPlayheadFrame(item.frame)}>第 {item.frame} 帧</button><b>{item.authorName}</b><span>{item.text}</span>{!item.resolvedAt && <button onClick={() => resolveReviewComment(item.id)}>标记已解决</button>}</div>)}</div>
        </section>

        <section>
          <div className="section-title">不可变版本</div>
          <div className="version-list">{versions.map((version) => <div key={version.id}><b>v{version.version} · {shotStatusZh[version.status]}</b><code>{version.snapshotHashSha256.slice(0, 12)}…</code><span>{version.createdBy}</span><button onClick={() => { try { rollbackToShotVersion(version.id); } catch (error) { setMessage(error instanceof Error ? error.message : '回滚被拒绝。'); } }}>从此版本创建新的制作中版本</button></div>)}</div>
        </section>

        <section>
          <div className="section-title">工程成员</div>
          <div className="member-list">{project.collaboration.members.map((item) => <div key={item.userId}><b>{item.displayName}</b><span>{item.department} · {roleZh[item.role]}{item.active ? '' : ' · 已停用'}</span></div>)}</div>
          <div className="member-form"><input placeholder="用户 ID" value={member.userId} onChange={(e) => setMember({ ...member, userId: e.target.value })} /><input placeholder="显示名称" value={member.displayName} onChange={(e) => setMember({ ...member, displayName: e.target.value })} /><select value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value as ProjectRole })}>{roles.map((role) => <option key={role} value={role}>{roleZh[role]}</option>)}</select><input placeholder="部门" value={member.department} onChange={(e) => setMember({ ...member, department: e.target.value })} /><button className="wide compact" onClick={addMember}>添加 / 更新成员</button></div>
        </section>

        <section>
          <div className="section-title">审批审计记录</div>
          <div className="approval-list">{approvals.map((item) => <div key={item.id}><b>{shotStatusZh[item.from]} → {shotStatusZh[item.to]}</b><span>{item.actorName} · {new Date(item.at).toLocaleString()}</span><small>{item.note}</small></div>)}</div>
        </section>
        {message && <div className="collab-conflict">{message}</div>}
      </aside>
    </div>
  </div>;
}
