import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import type { Shot } from '../domain/model';
import { renderDirectorFrame } from '../rendering/directorFrameRenderer';
import { renderShotAudioMixdown } from '../audio/audioTransport';
import { buildReferenceExportPlan } from './referenceExportPlan';

export type ReferenceExportOptions = {
  width?: number;
  height?: number;
  onProgress?: (progress: number) => void;
};

export type ReferenceExportResult = {
  blob: Blob;
  missingAudioClipIds: string[];
  frames: number;
  videoCodec: VideoCodec;
  audioCodec?: AudioCodec;
};

export { buildReferenceExportPlan } from './referenceExportPlan';

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function resolveReferenceExportSize(shot: Shot, options: ReferenceExportOptions = {}): { width: number; height: number } {
  if (options.width !== undefined && options.height !== undefined) {
    const width = even(Math.max(320, options.width));
    const height = even(Math.max(180, options.height));
    const actual = width / height;
    if (Math.abs(actual - shot.frameAspect) > 0.01) throw new Error(`MP4 输出宽高比 ${actual.toFixed(3)} 与 Shot 画幅 ${shot.frameAspect.toFixed(3)} 不一致。`);
    return { width, height };
  }
  if (options.width !== undefined) {
    const width = even(Math.max(320, options.width));
    return { width, height: even(width / shot.frameAspect) };
  }
  if (options.height !== undefined) {
    const height = even(Math.max(180, options.height));
    return { width: even(height * shot.frameAspect), height };
  }

  const longEdge = 960;
  if (shot.frameAspect >= 1) return { width: longEdge, height: even(longEdge / shot.frameAspect) };
  return { width: even(longEdge * shot.frameAspect), height: longEdge };
}

async function chooseReferenceVideoCodec(format: Mp4OutputFormat, width: number, height: number, quality: Quality): Promise<VideoCodec> {
  const supported = new Set(format.getSupportedVideoCodecs());
  const preferred = (['avc', 'vp9', 'vp8', 'av1', 'hevc'] as VideoCodec[]).filter((codec) => supported.has(codec));
  const codec = await getFirstEncodableVideoCodec(preferred, { width, height, quality });
  if (!codec) throw new Error('当前浏览器没有可用于 MP4 Reference 的视频编码器。');
  return codec;
}

async function chooseReferenceAudioCodec(format: Mp4OutputFormat, buffer: AudioBuffer, quality: Quality): Promise<AudioCodec> {
  const supported = new Set(format.getSupportedAudioCodecs());
  const preferred = (['aac', 'opus', 'mp3', 'pcm-s16'] as AudioCodec[]).filter((codec) => supported.has(codec));
  const codec = await getFirstEncodableAudioCodec(preferred, {
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    quality,
  });
  if (!codec) throw new Error('当前浏览器没有可用于 MP4 Reference 的音频编码器。');
  return codec;
}

export async function exportShotReferenceMp4(shot: Shot, options: ReferenceExportOptions = {}): Promise<ReferenceExportResult> {
  if (typeof document === 'undefined') throw new Error('MP4 参考导出需要浏览器 Canvas 环境。');
  if (typeof VideoEncoder === 'undefined') throw new Error('当前浏览器没有 WebCodecs VideoEncoder，无法输出 MP4 Reference。');

  const { width, height } = resolveReferenceExportSize(shot, options);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D Canvas 导出上下文。');

  const target = new BufferTarget();
  const format = new Mp4OutputFormat();
  const output = new Output({ format, target });
  const videoQuality = new Quality('medium');
  const audioQuality = new Quality('medium');
  const videoCodec = await chooseReferenceVideoCodec(format, width, height, videoQuality);
  const videoSource = new CanvasSource(canvas, { codec: videoCodec, quality: videoQuality });
  output.addVideoTrack(videoSource, { frameRate: shot.fps });

  const mix = await renderShotAudioMixdown(shot);
  let audioSource: AudioBufferSource | undefined;
  let audioCodec: AudioCodec | undefined;
  if (mix.buffer) {
    audioCodec = await chooseReferenceAudioCodec(format, mix.buffer, audioQuality);
    audioSource = new AudioBufferSource({ codec: audioCodec, quality: audioQuality });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  const plan = buildReferenceExportPlan(shot);
  for (let frame = 0; frame < plan.frames; frame += 1) {
    renderDirectorFrame(ctx, shot, frame, width, height);
    await videoSource.add(frame / shot.fps, 1 / shot.fps);
    options.onProgress?.((frame + 1) / Math.max(1, plan.frames + (mix.buffer ? 1 : 0)));
  }
  videoSource.close();

  if (audioSource && mix.buffer) {
    await audioSource.add(mix.buffer);
    audioSource.close();
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
    videoCodec,
    audioCodec,
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
