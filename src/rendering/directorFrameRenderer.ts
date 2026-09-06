import type { Shot } from '../domain/model';
import { projectWorldToFrame } from '../utils/math';
import { sampleShotAtFrame } from '../editorial/timelineEngine';

export type DirectorFrameRenderOptions = {
  showGuides?: boolean;
  showLabels?: boolean;
  showSlate?: boolean;
};

export function renderDirectorFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shot: Shot,
  frame: number,
  width: number,
  height: number,
  options: DirectorFrameRenderOptions = {},
): void {
  const { showGuides = true, showLabels = true, showSlate = true } = options;
  const sampled = sampleShotAtFrame(shot, frame);
  const { camera } = sampled;
  const aspect = width / Math.max(1, height);

  ctx.fillStyle = '#101419';
  ctx.fillRect(0, 0, width, height);

  if (showGuides) {
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 1;
    for (const value of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(width * value, 0); ctx.lineTo(width * value, height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, height * value); ctx.lineTo(width, height * value); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,209,102,.45)';
    ctx.strokeRect(width * .05, height * .05, width * .9, height * .9);
  }

  sampled.actors.forEach(({ actor, transform }, index) => {
    const foot = projectWorldToFrame(transform.position, camera, aspect);
    const head = projectWorldToFrame({ x: transform.position.x, y: transform.position.y + actor.eyeHeight, z: transform.position.z }, camera, aspect);
    if (!foot.visible && !head.visible) return;
    const x = head.x * width;
    const y = head.y * height;
    const bottom = foot.y * height;
    const bodyH = Math.max(24, bottom - y);
    ctx.strokeStyle = index % 2 ? '#d9a36d' : '#7db6e8';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, Math.max(8, bodyH * .09), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + bodyH * .1); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - bodyH * .22, y + bodyH * .35); ctx.lineTo(x + bodyH * .22, y + bodyH * .35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x - bodyH * .14, Math.min(height, bottom + bodyH * .25)); ctx.moveTo(x, bottom); ctx.lineTo(x + bodyH * .14, Math.min(height, bottom + bodyH * .25)); ctx.stroke();
    if (showLabels) {
      ctx.fillStyle = '#dfe7ef';
      ctx.font = '12px sans-serif';
      ctx.fillText(actor.name, x + 12, y - 8);
    }
  });

  if (showSlate) {
    ctx.fillStyle = '#dbe6ef';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`${shot.name} | F ${sampled.frame} | T ${sampled.time.toFixed(3)}s | ${camera.focalLengthMm.toFixed(0)}mm`, 18, height - 22);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('PDS Director Reference · deterministic frame render', 18, 24);
  }
}
