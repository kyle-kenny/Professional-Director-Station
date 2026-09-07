import type { Shot } from '../domain/model';
import { fitAspectRect, projectWorldToFrame } from '../utils/math';
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
  const frameRect = fitAspectRect(width, height, shot.frameAspect);

  ctx.fillStyle = '#080b0f';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(frameRect.x, frameRect.y);
  ctx.beginPath();
  ctx.rect(0, 0, frameRect.width, frameRect.height);
  ctx.clip();
  ctx.fillStyle = '#101419';
  ctx.fillRect(0, 0, frameRect.width, frameRect.height);

  if (showGuides) {
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 1;
    for (const value of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(frameRect.width * value, 0); ctx.lineTo(frameRect.width * value, frameRect.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, frameRect.height * value); ctx.lineTo(frameRect.width, frameRect.height * value); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,209,102,.45)';
    ctx.strokeRect(frameRect.width * .05, frameRect.height * .05, frameRect.width * .9, frameRect.height * .9);
  }

  sampled.actors.forEach(({ actor, transform }, index) => {
    const feet = projectWorldToFrame(transform.position, camera, shot.frameAspect);
    const eye = projectWorldToFrame({ x: transform.position.x, y: transform.position.y + actor.eyeHeight, z: transform.position.z }, camera, shot.frameAspect);
    const crown = projectWorldToFrame({ x: transform.position.x, y: transform.position.y + actor.demographics.heightM, z: transform.position.z }, camera, shot.frameAspect);
    if (!feet.visible && !eye.visible && !crown.visible) return;

    const x = eye.x * frameRect.width;
    const eyeY = eye.y * frameRect.height;
    const crownY = crown.y * frameRect.height;
    const feetY = feet.y * frameRect.height;
    const projectedHeight = Math.max(24, Math.abs(feetY - crownY));
    const headRadius = Math.max(6, projectedHeight * .055);
    const shoulderY = eyeY + projectedHeight * .10;
    const hipY = eyeY + projectedHeight * .58;
    const shoulderHalf = projectedHeight * .105;
    const footHalf = projectedHeight * .045;

    ctx.strokeStyle = index % 2 ? '#d9a36d' : '#7db6e8';
    ctx.lineWidth = Math.max(2, Math.min(4, projectedHeight * .018));
    ctx.beginPath(); ctx.arc(x, crownY + headRadius, headRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, shoulderY); ctx.lineTo(x, hipY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - shoulderHalf, shoulderY); ctx.lineTo(x + shoulderHalf, shoulderY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(x - footHalf, feetY); ctx.moveTo(x, hipY); ctx.lineTo(x + footHalf, feetY); ctx.stroke();

    if (showLabels) {
      ctx.fillStyle = '#dfe7ef';
      ctx.font = '12px sans-serif';
      ctx.fillText(actor.name, x + headRadius + 5, crownY - 5);
    }
  });

  if (showSlate) {
    ctx.fillStyle = '#dbe6ef';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`${shot.name} | F ${sampled.frame} | T ${sampled.time.toFixed(3)}s | ${camera.focalLengthMm.toFixed(0)}mm | ${shot.frameAspect.toFixed(3)}:1`, 18, frameRect.height - 22);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('PDS Director Reference · deterministic frame render', 18, 24);
  }
  ctx.restore();
}
