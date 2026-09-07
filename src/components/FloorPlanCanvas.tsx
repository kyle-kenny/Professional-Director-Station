import { useEffect, useRef } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import { cameraGroundFrustum } from '../utils/math';

const SCALE = 48;
const actorTag = (sex: 'male' | 'female', age: 'child' | 'teen' | 'adult' | 'elderly') => {
  const ageLabel = { child: '童', teen: '少', adult: '成', elderly: '老' }[age];
  return `${sex === 'male' ? '男' : '女'}${ageLabel}`;
};

export function FloorPlanCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const shot = useDirectorStore((s) => s.getActiveShot());
  const playhead = useDirectorStore((s) => s.playhead);
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
      const sampledActors = shot.actors.map((actor) => ({ actor, transform: sampleActorTransform(actor, playhead) }));
      const sampledLights = shot.lights.map((light) => ({ source: light, light: sampleLight(light, playhead) }));
      const camera = sampleCamera(shot.camera, playhead);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#14181e'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#27313b'; ctx.lineWidth = 1;
      for (let x = w / 2 % SCALE; x < w; x += SCALE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = h / 2 % SCALE; y < h; y += SCALE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      if (sampledActors.length >= 2) {
        const a = world(sampledActors[0].transform.position.x, sampledActors[0].transform.position.z, w, h);
        const b = world(sampledActors[1].transform.position.x, sampledActors[1].transform.position.z, w, h);
        ctx.setLineDash([8, 6]); ctx.strokeStyle = '#e8b04d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#e8b04d'; ctx.font = '12px sans-serif'; ctx.fillText('180° ACTION AXIS', (a.x + b.x) / 2 - 52, (a.y + b.y) / 2 - 10);
      }

      const cam = world(camera.position.x, camera.position.z, w, h);
      const frustum = cameraGroundFrustum(camera, 6);
      const left = world(frustum.left.x, frustum.left.z, w, h);
      const right = world(frustum.right.x, frustum.right.z, w, h);
      const center = world(frustum.center.x, frustum.center.z, w, h);
      ctx.fillStyle = 'rgba(100,180,255,.12)'; ctx.strokeStyle = '#64b4ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.setLineDash([4, 5]); ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(center.x, center.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = '#64b4ff'; ctx.fillRect(cam.x - 8, cam.y - 6, 16, 12); ctx.fillStyle = '#dfe9f3'; ctx.font = '11px sans-serif'; ctx.fillText(`${camera.focalLengthMm.toFixed(0)}mm · HFOV ${frustum.horizontalFovDeg.toFixed(1)}°`, cam.x + 12, cam.y + 4);

      sampledActors.forEach(({ actor, transform }) => {
        const p = world(transform.position.x, transform.position.z, w, h);
        const male = actor.demographics.sex === 'male';
        ctx.fillStyle = actor.id === selected ? '#ffd166' : male ? '#5b9bd5' : '#d58aa8';
        ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#11161b'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(actorTag(actor.demographics.sex, actor.demographics.ageGroup), p.x, p.y);
        ctx.fillStyle = '#dfe9f3'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillText(actor.name, p.x, p.y - 21);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      });

      sampledLights.filter(({ light }) => light.type !== 'ambient').forEach(({ source, light }) => {
        const p = world(light.position.x, light.position.z, w, h);
        const isSelected = source.id === selected;
        ctx.strokeStyle = isSelected ? '#ffd166' : '#ffe19a';
        ctx.fillStyle = isSelected ? 'rgba(255,209,102,.22)' : 'rgba(255,225,154,.08)';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
        ctx.strokeRect(p.x - 9, p.y - 9, 18, 18);
        ctx.fillStyle = isSelected ? '#ffd166' : '#ffe19a'; ctx.font = '11px sans-serif'; ctx.fillText(light.name, p.x + 13, p.y + 4);
        if (isSelected && light.target) {
          const target = world(light.target.x, light.target.z, w, h);
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(target.x, target.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    return () => ro.disconnect();
  }, [shot, selected, playhead]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current!; const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const actor of shot.actors) {
      const transform = sampleActorTransform(actor, playhead);
      const x = rect.width / 2 + transform.position.x * SCALE, y = rect.height / 2 + transform.position.z * SCALE;
      if (Math.hypot(mx - x, my - y) < 22) { select(actor.id); return; }
    }
    for (const source of shot.lights.filter((item) => item.type !== 'ambient')) {
      const light = sampleLight(source, playhead);
      const x = rect.width / 2 + light.position.x * SCALE, y = rect.height / 2 + light.position.z * SCALE;
      if (Math.abs(mx - x) < 18 && Math.abs(my - y) < 18) { select(source.id); return; }
    }
  };

  return <div className="canvas-workspace">
    <div className="canvas-header"><span className="chip">Floor Plan / 站位图</span><span>T {playhead.toFixed(2)}s · HFOV：真实水平FOV视锥 · 黄虚线：180°轴线 · 方框：灯位</span></div>
    <canvas ref={ref} onClick={click} />
  </div>;
}
