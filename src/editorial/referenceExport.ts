import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from 'mediabunny';
import type { Shot } from '../domain/model';
import { renderDirectorFrame } from '../rendering/directorFrameRenderer';
import { renderShotAudioMixdown } from '../audio/audioTransport';
import { totalFrames } from './timelineEngine';

export type ReferenceExportOptions = {
  width?: number;
  height?: number;
  onProgress?: (progress: number) => void;
};

export type ReferenceExportResult = {
  blob: Blob;
  missingAudioClipIds: string[];
  frames: number;
};

export function buildReferenceExportPlan(shot: Shot) {
  const frames = totalFrames(shot.duration, shot.fps);
  return {
    fps: shot.fps,
    frames,
    duration: frames / shot.fps,
    timestamps: Array.from({ length: frames }, (_, frame) => frame / shot.fps),
  };
}

export async function exportShotReferenceMp4(shot: Shot, options: ReferenceExportOptions = {}): Promise<ReferenceExportResult> {
  if (typeof document === 'undefined') throw new Error('MP4 参考导出需要浏览器 Canvas 环境。');
  if (typeof VideoEncoder === 'undefined') throw new Error('当前浏览器没有 WebCodecs VideoEncoder，无法输出 H.264 MP4。');

  const width = Math.max(320, Math.round(options.width ?? 1280));
  const height = Math.max(180, Math.round(options.height ?? 720));
  if (width % 2 || height % 2) throw new Error('MP4 输出尺寸必须为偶数。');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D Canvas 导出上下文。');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: new Quality('high') });
  output.addVideoTrack(videoSource, { frameRate: shot.fps });

  const mix = await renderShotAudioMixdown(shot);
  let audioSource: AudioBufferSource | undefined;
  if (mix.buffer) {
    audioSource = new AudioBufferSource({ codec: 'aac', quality: new Quality('high') });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  const plan = buildReferenceExportPlan(shot);
  for (let frame = 0; frame < plan.frames; frame += 1) {
    renderDirectorFrame(ctx, shot, frame, width, height);
    await videoSource.add(frame / shot.fps, 1 / shot.fps);
    options.onProgress?.((frame + 1) / Math.max(1, plan.frames + (mix.buffer ? 1 : 0)));
  }
  if (audioSource && mix.buffer) {
    await audioSource.add(mix.buffer);
    options.onProgress?.(1);
  }
  await output.finalize();

  const buffer = target.buffer;
  if (!buffer) throw new Error('MP4 muxer 未返回输出缓冲区。');
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const payload = bytes.slice().buffer as ArrayBuffer;
  return {
    blob: new Blob([payload], { type: 'video/mp4' }),
    missingAudioClipIds: mix.missingClipIds,
    frames: plan.frames,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, fileName: string, mimeType = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${mimeType};charset=utf-8` }), fileName);
}
