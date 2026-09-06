import type { Shot } from '../domain/model';
import { getAudioMedia } from '../storage/audioMediaStore';

export const MAX_REFERENCE_EXPORT_SECONDS = 300;

const dbToGain = (db: number) => Math.pow(10, db / 20);

async function decodeStored(context: BaseAudioContext, clipId: string): Promise<AudioBuffer | undefined> {
  const media = await getAudioMedia(clipId);
  if (!media) return undefined;
  return context.decodeAudioData(media.bytes.slice(0));
}

export type AudioPlaybackHandle = {
  stop: () => void;
  missingClipIds: string[];
};

export async function playShotAudio(shot: Shot, playhead: number): Promise<AudioPlaybackHandle> {
  const AudioContextCtor = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('当前浏览器不支持 Web Audio 播放。');
  const context = new AudioContextCtor();
  await context.resume();
  const sources: AudioBufferSourceNode[] = [];
  const missingClipIds: string[] = [];
  const base = context.currentTime + 0.03;

  for (const clip of shot.audio) {
    const clipEnd = clip.start + clip.duration;
    if (clipEnd <= playhead) continue;
    const buffer = await decodeStored(context, clip.id);
    if (!buffer) {
      if (clip.waveformKey || clip.sourceFileName) missingClipIds.push(clip.id);
      continue;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = dbToGain(clip.gainDb);
    source.connect(gain).connect(context.destination);
    const offset = Math.max(0, playhead - clip.start);
    const timelineDelay = Math.max(0, clip.start - playhead);
    const remaining = Math.min(clip.duration - offset, Math.max(0, buffer.duration - offset));
    if (remaining > 0) {
      source.start(base + timelineDelay, offset, remaining);
      sources.push(source);
    }
  }

  let stopped = false;
  return {
    missingClipIds,
    stop: () => {
      if (stopped) return;
      stopped = true;
      sources.forEach((source) => { try { source.stop(); } catch { /* already ended */ } });
      void context.close().catch(() => undefined);
    },
  };
}

export async function renderShotAudioMixdown(shot: Shot, sampleRate = 48000): Promise<{ buffer?: AudioBuffer; missingClipIds: string[] }> {
  if (shot.duration > MAX_REFERENCE_EXPORT_SECONDS) throw new Error(`单 Shot 参考导出上限为 ${MAX_REFERENCE_EXPORT_SECONDS}s，避免浏览器内存失控。`);
  const length = Math.max(1, Math.ceil(shot.duration * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const missingClipIds: string[] = [];
  let scheduled = 0;

  for (const clip of shot.audio) {
    const media = await getAudioMedia(clip.id);
    if (!media) {
      if (clip.waveformKey || clip.sourceFileName) missingClipIds.push(clip.id);
      continue;
    }
    const decoded = await offline.decodeAudioData(media.bytes.slice(0));
    const source = offline.createBufferSource();
    source.buffer = decoded;
    const gain = offline.createGain();
    gain.gain.value = dbToGain(clip.gainDb);
    source.connect(gain).connect(offline.destination);
    const duration = Math.min(clip.duration, decoded.duration, Math.max(0, shot.duration - clip.start));
    if (duration > 0) {
      source.start(clip.start, 0, duration);
      scheduled += 1;
    }
  }

  if (scheduled === 0) return { missingClipIds };
  return { buffer: await offline.startRendering(), missingClipIds };
}
