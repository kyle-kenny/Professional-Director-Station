import type { AudioClip } from '../domain/model';
import { putAudioMedia } from '../storage/audioMediaStore';
import { decodeAudioFile } from './waveform';
import { snapTimeToFrame } from '../editorial/timelineEngine';

export const MAX_AUDIO_INGEST_BYTES = 512 * 1024 * 1024;

function createClipId(kind: AudioClip['kind']): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `audio-${kind}-${random}`;
}

export async function importAudioFile(
  file: File,
  kind: AudioClip['kind'],
  start: number,
  shotDuration: number,
  fps: number,
): Promise<AudioClip> {
  if (file.size <= 0) throw new Error('音频文件为空。');
  if (file.size > MAX_AUDIO_INGEST_BYTES) throw new Error('单个音频文件超过 512 MiB 导入上限。');
  const { bytes, waveform } = await decodeAudioFile(file);
  const clipId = createClipId(kind);
  const safeStart = Math.min(snapTimeToFrame(start, shotDuration, fps), Math.max(0, shotDuration - 1 / fps));
  const duration = Math.max(1 / fps, Math.min(waveform.duration, shotDuration - safeStart));
  await putAudioMedia({
    clipId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    importedAt: new Date().toISOString(),
    duration: waveform.duration,
    sampleRate: waveform.sampleRate,
    channels: waveform.channels,
    waveform: waveform.peaks,
    bytes,
  });
  return {
    id: clipId,
    name: file.name.replace(/\.[^.]+$/, ''),
    kind,
    start: safeStart,
    duration,
    gainDb: 0,
    uri: '',
    sourceFileName: file.name,
    sourceSizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    sampleRate: waveform.sampleRate,
    channels: waveform.channels,
    waveformKey: clipId,
  };
}
