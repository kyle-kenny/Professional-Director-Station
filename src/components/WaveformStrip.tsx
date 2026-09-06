import { useEffect, useMemo, useState } from 'react';
import { getAudioMedia } from '../storage/audioMediaStore';

export function WaveformStrip({ clipId }: { clipId: string }) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAudioMedia(clipId).then((record) => { if (!cancelled) setPeaks(record?.waveform ?? []); }).catch(() => { if (!cancelled) setPeaks([]); });
    return () => { cancelled = true; };
  }, [clipId]);

  const path = useMemo(() => {
    if (!peaks?.length) return '';
    const width = 240;
    const center = 20;
    const scale = 17;
    const top = peaks.map((peak, index) => `${index * width / Math.max(1, peaks.length - 1)},${center - peak * scale}`);
    const bottom = peaks.slice().reverse().map((peak, reverseIndex) => {
      const index = peaks.length - 1 - reverseIndex;
      return `${index * width / Math.max(1, peaks.length - 1)},${center + peak * scale}`;
    });
    return `M${top[0]} L${top.slice(1).join(' L')} L${bottom.join(' L')} Z`;
  }, [peaks]);

  if (peaks === null) return <div className="waveform loading">loading waveform…</div>;
  if (!peaks.length) return <div className="waveform missing">media cache missing</div>;
  return <svg className="waveform" viewBox="0 0 240 40" preserveAspectRatio="none" aria-label="Audio waveform"><path d={path} /></svg>;
}
