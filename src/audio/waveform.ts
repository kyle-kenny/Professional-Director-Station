export type DecodedWaveform = {
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
};

export function buildWaveformPeaks(channels: ArrayLike<number>[], bins = 240): number[] {
  if (!Number.isInteger(bins) || bins <= 0) throw new Error('bins must be a positive integer');
  const length = channels.reduce((max, channel) => Math.max(max, channel.length), 0);
  if (length === 0) return Array.from({ length: bins }, () => 0);
  const peaks: number[] = [];
  for (let bin = 0; bin < bins; bin += 1) {
    const start = Math.floor(bin * length / bins);
    const end = Math.max(start + 1, Math.floor((bin + 1) * length / bins));
    let peak = 0;
    for (const channel of channels) {
      const safeEnd = Math.min(end, channel.length);
      for (let index = start; index < safeEnd; index += 1) peak = Math.max(peak, Math.abs(Number(channel[index]) || 0));
    }
    peaks.push(Math.min(1, peak));
  }
  return peaks;
}

export async function decodeAudioBytes(bytes: ArrayBuffer, bins = 240): Promise<{ buffer: AudioBuffer; waveform: DecodedWaveform }> {
  const AudioContextCtor = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('当前浏览器不支持 Web Audio 解码。');
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    return {
      buffer,
      waveform: {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        peaks: buildWaveformPeaks(channels, bins),
      },
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function decodeAudioFile(file: File, bins = 240): Promise<{ bytes: ArrayBuffer; waveform: DecodedWaveform }> {
  const bytes = await file.arrayBuffer();
  const { waveform } = await decodeAudioBytes(bytes, bins);
  return { bytes, waveform };
}
