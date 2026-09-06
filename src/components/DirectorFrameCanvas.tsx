import { useEffect, useRef } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { renderDirectorFrame } from '../rendering/directorFrameRenderer';
import { timeToFrame } from '../editorial/timelineEngine';

export function DirectorFrameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const shot = useDirectorStore((s) => s.getActiveShot());
  const playhead = useDirectorStore((s) => s.playhead);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(devicePixelRatio, 2);
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderDirectorFrame(ctx, shot, timeToFrame(playhead, shot.fps), rect.width, rect.height);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [shot, playhead]);
  return <div className="canvas-workspace"><div className="canvas-header"><span className="chip">Director Frame / 构图结构图</span><span>与时间线/MP4共享同一逐帧渲染器</span></div><canvas ref={ref} /></div>;
}
