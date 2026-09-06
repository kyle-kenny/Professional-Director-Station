import { useEffect, useRef } from 'react';
import { useDirectorStore } from '../store/directorStore';

const SCALE = 48;
const actorTag = (sex: 'male'|'female', age: 'child'|'teen'|'adult'|'elderly') => {
  const ageLabel = { child: '童', teen: '少', adult: '成', elderly: '老' }[age];
  return `${sex === 'male' ? '男' : '女'}${ageLabel}`;
};


export function FloorPlanCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const shot = useDirectorStore((s) => s.getActiveShot());
  const selected = useDirectorStore((s) => s.selectedObjectId);
  const select = useDirectorStore((s) => s.selectObject);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(devicePixelRatio, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(rect.width, rect.height);
    };
    const world = (x: number, z: number, w: number, h: number) => ({ x: w / 2 + x * SCALE, y: h / 2 + z * SCALE });
    const draw = (w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#14181e'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#27313b'; ctx.lineWidth = 1;
      for (let x = w / 2 % SCALE; x < w; x += SCALE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = h / 2 % SCALE; y < h; y += SCALE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      if (shot.actors.length >= 2) {
        const a = world(shot.actors[0].transform.position.x, shot.actors[0].transform.position.z, w, h);
        const b = world(shot.actors[1].transform.position.x, shot.actors[1].transform.position.z, w, h);
        ctx.setLineDash([8, 6]); ctx.strokeStyle = '#e8b04d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#e8b04d'; ctx.font = '12px sans-serif'; ctx.fillText('180° ACTION AXIS', (a.x+b.x)/2 - 52, (a.y+b.y)/2 - 10);
      }

      const cam = world(shot.camera.position.x, shot.camera.position.z, w, h);
      const tgt = world(shot.camera.target.x, shot.camera.target.z, w, h);
      const dx = tgt.x - cam.x, dy = tgt.y - cam.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / len, ny = dy / len, px = -ny, py = nx;
      const spread = 70;
      ctx.fillStyle = 'rgba(100,180,255,.12)'; ctx.strokeStyle = '#64b4ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(tgt.x + px*spread, tgt.y + py*spread); ctx.lineTo(tgt.x - px*spread, tgt.y - py*spread); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#64b4ff'; ctx.fillRect(cam.x-8, cam.y-6, 16, 12); ctx.fillStyle = '#dfe9f3'; ctx.fillText(`${shot.camera.focalLengthMm}mm`, cam.x+12, cam.y+4);

      shot.actors.forEach((actor, i) => {
        const p = world(actor.transform.position.x, actor.transform.position.z, w, h);
        const male = actor.demographics.sex === 'male';
        ctx.fillStyle = actor.id === selected ? '#ffd166' : male ? '#5b9bd5' : '#d58aa8';
        ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#11161b'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(actorTag(actor.demographics.sex, actor.demographics.ageGroup), p.x, p.y);
        ctx.fillStyle = '#dfe9f3'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillText(actor.name, p.x, p.y - 21);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      });

      shot.lights.filter((l) => l.type !== 'ambient').forEach((l) => {
        const p = world(l.position.x, l.position.z, w, h);
        ctx.strokeStyle = '#ffe19a'; ctx.lineWidth = 2; ctx.strokeRect(p.x-8,p.y-8,16,16);
        ctx.fillStyle = '#ffe19a'; ctx.font = '11px sans-serif'; ctx.fillText(l.name, p.x+12,p.y+4);
      });
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    return () => ro.disconnect();
  }, [shot, selected]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!; const rect = canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    for (const a of shot.actors) {
      const x=rect.width/2+a.transform.position.x*SCALE, y=rect.height/2+a.transform.position.z*SCALE;
      if (Math.hypot(mx-x,my-y)<22) { select(a.id); return; }
    }
  };

  return <div className="canvas-workspace">
    <div className="canvas-header"><span className="chip">Floor Plan / 站位图</span><span>蓝线：摄影机视锥 · 黄虚线：180°轴线 · 方框：灯位</span></div>
    <canvas ref={ref} onClick={click} />
  </div>;
}
