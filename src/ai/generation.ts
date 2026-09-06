import type { AiGeneratedMedia, AiModelProfile, AiModelProfileSnapshot } from '../domain/ai';
import type { DirectorProject, Shot } from '../domain/model';
import { analyzeFrameControls, controlBundleHash, type AiControlBundle } from './controlAnalysis';
import { canonicalJson, sha256Bytes, sha256Text } from '../utils/sha256';

export type AiGenerationRequest = {
  schema: 'pds-ai-generation-1';
  task: 'storyboard' | 'video';
  projectId: string;
  source: { shotId: string; shotVersion: number; shotHashSha256: string; frame?: number; fps: number };
  profile: AiModelProfileSnapshot;
  prompt: string;
  negativePrompt: string;
  promptHashSha256: string;
  controls: AiControlBundle;
  controlHashSha256: string;
};

export type PdsAiEndpointResponse = {
  mediaUrl?: string;
  mediaBase64?: string;
  mimeType?: string;
  jobId?: string;
  seed?: number;
  error?: string;
};

export type GeneratedPayload = {
  record: AiGeneratedMedia;
  bytes?: Uint8Array;
};

export function snapshotProfile(profile: AiModelProfile, parameterOverrides: Record<string, string | number | boolean> = {}): AiModelProfileSnapshot {
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    modelId: profile.modelId,
    revision: profile.revision,
    parameters: { ...profile.defaultParameters, ...parameterOverrides },
  };
}

export function buildGenerationRequest(project: DirectorProject, shot: Shot, task: 'storyboard' | 'video', frame: number, profile: AiModelProfile, prompt: string, negativePrompt = '', parameterOverrides: Record<string, string | number | boolean> = {}): AiGenerationRequest {
  if (!profile.enabled) throw new Error(`AI profile ${profile.id} is disabled.`);
  if (!profile.tasks.includes(task)) throw new Error(`AI profile ${profile.id} does not support ${task}.`);
  const controls = analyzeFrameControls(shot, frame);
  const cleanPrompt = prompt.trim();
  const cleanNegative = negativePrompt.trim();
  const profileSnapshot = snapshotProfile(profile, parameterOverrides);
  return {
    schema: 'pds-ai-generation-1',
    task,
    projectId: project.id,
    source: {
      shotId: shot.id,
      shotVersion: shot.version,
      shotHashSha256: sha256Text(canonicalJson(shot)),
      frame: task === 'storyboard' ? controls.frame : undefined,
      fps: shot.fps,
    },
    profile: profileSnapshot,
    prompt: cleanPrompt,
    negativePrompt: cleanNegative,
    promptHashSha256: sha256Text(canonicalJson({ prompt: cleanPrompt, negativePrompt: cleanNegative })),
    controls,
    controlHashSha256: controlBundleHash(controls),
  };
}

export function generateLocalStructuralStoryboard(request: AiGenerationRequest): GeneratedPayload {
  if (request.task !== 'storyboard') throw new Error('Local structural profile only renders storyboard frames.');
  const width = numericParam(request.profile.parameters.width, 1280);
  const height = numericParam(request.profile.parameters.height, 720);
  const svg = structuralStoryboardSvg(request, width, height);
  const bytes = new TextEncoder().encode(svg);
  const id = `ai-storyboard-${request.source.shotId}-${request.source.frame ?? 0}-${request.controlHashSha256.slice(0, 10)}`;
  const now = new Date().toISOString();
  return {
    bytes,
    record: {
      id,
      task: 'storyboard',
      status: 'generated',
      sourceShotId: request.source.shotId,
      sourceShotVersion: request.source.shotVersion,
      sourceShotHashSha256: request.source.shotHashSha256,
      sourceFrame: request.source.frame,
      profile: request.profile,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      promptHashSha256: request.promptHashSha256,
      controlHashSha256: request.controlHashSha256,
      uri: `pds://ai/${id}.svg`,
      mimeType: 'image/svg+xml',
      contentHashSha256: sha256Bytes(bytes),
      generatedAt: now,
    },
  };
}

export async function invokePdsAiEndpoint(profile: AiModelProfile, request: AiGenerationRequest, runtimeToken?: string, fetchImpl: typeof fetch = fetch): Promise<GeneratedPayload> {
  if (profile.provider !== 'pds-http' || !profile.endpoint) throw new Error('A pds-http profile with endpoint is required.');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (runtimeToken?.trim()) headers.authorization = `Bearer ${runtimeToken.trim()}`;
  const response = await fetchImpl(profile.endpoint, { method: 'POST', headers, body: JSON.stringify(request) });
  const payload = await response.json() as PdsAiEndpointResponse;
  if (!response.ok || payload.error) throw new Error(payload.error || `AI endpoint failed with HTTP ${response.status}.`);
  let bytes: Uint8Array | undefined;
  if (payload.mediaBase64) bytes = decodeBase64(payload.mediaBase64);
  if (!bytes && !payload.mediaUrl) throw new Error('AI endpoint returned neither mediaBase64 nor mediaUrl.');
  const id = `ai-${request.task}-${request.source.shotId}-${Date.now()}-${request.controlHashSha256.slice(0, 8)}`;
  return {
    bytes,
    record: {
      id,
      task: request.task,
      status: 'generated',
      sourceShotId: request.source.shotId,
      sourceShotVersion: request.source.shotVersion,
      sourceShotHashSha256: request.source.shotHashSha256,
      sourceFrame: request.source.frame,
      profile: request.profile,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      promptHashSha256: request.promptHashSha256,
      controlHashSha256: request.controlHashSha256,
      uri: bytes ? `pds://ai/${id}` : payload.mediaUrl!,
      mimeType: payload.mimeType,
      contentHashSha256: bytes ? sha256Bytes(bytes) : undefined,
      providerJobId: payload.jobId,
      seed: payload.seed,
      generatedAt: new Date().toISOString(),
    },
  };
}

function structuralStoryboardSvg(request: AiGenerationRequest, width: number, height: number): string {
  const controls = request.controls;
  const actorMarkup = controls.lineart.map((actor) => {
    const pose = controls.pose.find((item) => item.actorId === actor.actorId);
    const depth = controls.depth.find((item) => item.actorId === actor.actorId)?.normalized ?? 0.5;
    const x = actor.center.x * width;
    const headY = actor.head.y * height;
    const centerY = actor.center.y * height;
    const feetY = actor.feet.y * height;
    const radius = Math.max(8, Math.min(26, 22 - depth * 10));
    return `<g data-actor="${escapeXml(actor.actorId)}" opacity="${actor.center.visible ? 1 : 0.3}"><line x1="${x.toFixed(1)}" y1="${headY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${feetY.toFixed(1)}" stroke="white" stroke-width="4"/><circle cx="${x.toFixed(1)}" cy="${headY.toFixed(1)}" r="${radius.toFixed(1)}" fill="none" stroke="white" stroke-width="4"/><text x="${(x + 12).toFixed(1)}" y="${centerY.toFixed(1)}" fill="white" font-size="18">${escapeXml(pose?.name ?? actor.actorId)} · ${escapeXml(pose?.pose ?? '')}</text></g>`;
  }).join('');
  const camera = controls.cameraReference;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#17191d"/><path d="M ${width / 3} 0 V ${height} M ${2 * width / 3} 0 V ${height} M 0 ${height / 3} H ${width} M 0 ${2 * height / 3} H ${width}" stroke="#555" stroke-width="1"/>${actorMarkup}<text x="24" y="36" fill="white" font-size="22">PDS STRUCTURAL STORYBOARD · ${escapeXml(request.source.shotId)} · F${request.source.frame ?? 0}</text><text x="24" y="64" fill="#bbb" font-size="16">${camera.focalLengthMm.toFixed(0)}mm · ${camera.verticalFovDeg.toFixed(1)}° · controls ${request.controlHashSha256.slice(0, 12)}</text><text x="24" y="${height - 24}" fill="#bbb" font-size="16">${escapeXml(request.prompt || 'No prompt')}</text></svg>`;
}

const numericParam = (value: string | number | boolean | undefined, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(64, Math.round(value)) : fallback;
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function decodeBase64(value: string): Uint8Array { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
