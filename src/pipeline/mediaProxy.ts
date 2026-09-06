import type { MediaProxyPolicy } from '../domain/pipeline';

export type ProxyMediaKind = 'video' | 'audio' | 'image';
export type MediaProxyDescriptor = {
  sourceUri: string;
  proxyUri: string;
  kind: ProxyMediaKind;
  policy: MediaProxyPolicy;
  required: boolean;
  reason: string;
};

const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '_');

export function proxyUriFor(sourceUri: string, kind: ProxyMediaKind, policy: MediaProxyPolicy): string {
  const file = safe(sourceUri.split('/').pop() || 'media');
  const suffix = kind === 'video' ? `${policy.maxWidth}x${policy.maxHeight}.${policy.videoCodec}.mp4` : kind === 'audio' ? `${policy.audioSampleRate}.${policy.audioCodec}` : `${policy.maxWidth}x${policy.maxHeight}.proxy`;
  return `pds://proxy/${file}.${suffix}`;
}

export function planMediaProxy(sourceUri: string, kind: ProxyMediaKind, policy: MediaProxyPolicy, source?: { width?: number; height?: number; bitrateMbps?: number; sampleRate?: number }): MediaProxyDescriptor {
  if (!policy.enabled) return { sourceUri, proxyUri: sourceUri, kind, policy, required: false, reason: 'proxy-disabled' };
  let required = false;
  const reasons: string[] = [];
  if (kind === 'video' || kind === 'image') {
    if ((source?.width ?? 0) > policy.maxWidth || (source?.height ?? 0) > policy.maxHeight) { required = true; reasons.push('resolution'); }
  }
  if (kind === 'video' && (source?.bitrateMbps ?? 0) > policy.targetBitrateMbps) { required = true; reasons.push('bitrate'); }
  if (kind === 'audio' && (source?.sampleRate ?? 0) > policy.audioSampleRate) { required = true; reasons.push('sample-rate'); }
  return { sourceUri, proxyUri: proxyUriFor(sourceUri, kind, policy), kind, policy, required, reason: reasons.join('+') || 'within-policy' };
}
