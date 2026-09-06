import { describe, expect, it } from 'vitest';
import { buildWaveformPeaks } from '../audio/waveform';

describe('Gate 2 waveform analysis', () => {
  it('produces deterministic peak bins across channels', () => {
    const left = Float32Array.from([0, .2, -.8, .1, .3, 0, -.4, .2]);
    const right = Float32Array.from([0, .1, -.2, .9, .1, 0, -.1, .7]);
    const peaks = buildWaveformPeaks([left, right], 4);
    [.2, .9, .3, .7].forEach((expected, index) => expect(peaks[index]).toBeCloseTo(expected, 6));
    expect(buildWaveformPeaks([left, right], 4)).toEqual(peaks);
  });

  it('clamps peaks and handles empty audio', () => {
    expect(buildWaveformPeaks([Float32Array.from([2, -3])], 1)).toEqual([1]);
    expect(buildWaveformPeaks([], 3)).toEqual([0, 0, 0]);
    expect(() => buildWaveformPeaks([], 0)).toThrow();
  });
});
