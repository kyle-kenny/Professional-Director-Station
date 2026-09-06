import { aiModelProfileSchema, type AiGeneratedMedia, type AiModelProfile, type AiSceneCandidate } from '../domain/ai';
import type { AssetRef, DirectorProject, Shot } from '../domain/model';
import { requirePermission } from '../collab/authorization';
import { getSessionIdentity } from '../collab/sessionIdentity';
import { timeToFrame } from '../editorial/timelineEngine';
import { breakDownScript } from '../ai/scriptBreakdown';
import { buildGenerationRequest, generateLocalStructuralStoryboard, invokePdsAiEndpoint } from '../ai/generation';
import { putAiGeneratedMedia } from '../storage/aiMediaStore';
import { recordProjectHistory } from './projectHistory';
import { registerProjectAsset } from './assetRegistry';
import { useDirectorStore } from './directorStore';

const STORAGE_KEY = 'pds.project.v1';

function persist(project: DirectorProject) {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

function commitProject(mutator: (project: DirectorProject) => void): DirectorProject {
  const state = useDirectorStore.getState();
  const history = recordProjectHistory(state.project, { undoStack: state.undoStack, redoStack: state.redoStack });
  const project = structuredClone(state.project);
  mutator(project);
  persist(project);
  useDirectorStore.setState({ project, ...history });
  return project;
}

function getActiveShot(project: DirectorProject): Shot {
  const state = useDirectorStore.getState();
  const shot = project.sequences.find((sequence) => sequence.id === state.activeSequenceId)?.shots.find((item) => item.id === state.activeShotId);
  if (!shot) throw new Error('Active shot not found');
  return shot;
}

export function runScriptBreakdown(script: string): AiSceneCandidate[] {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  const candidates = breakDownScript(script);
  commitProject((project) => { project.ai.sceneCandidates = candidates; });
  return candidates;
}

export function upsertAiModelProfile(input: AiModelProfile): AiModelProfile {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  const profile = aiModelProfileSchema.parse(input);
  commitProject((project) => {
    const index = project.ai.profiles.findIndex((item) => item.id === profile.id);
    if (index >= 0) project.ai.profiles[index] = profile;
    else project.ai.profiles.push(profile);
    project.ai.profiles.sort((a, b) => a.id.localeCompare(b.id));
  });
  return profile;
}

export function removeAiModelProfile(profileId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  if (profileId === 'local-structural-v1') throw new Error('Built-in local structural profile cannot be removed.');
  commitProject((project) => { project.ai.profiles = project.ai.profiles.filter((item) => item.id !== profileId); });
}

export async function generateAiMedia(input: {
  profileId: string;
  task: 'storyboard' | 'video';
  prompt: string;
  negativePrompt?: string;
  runtimeToken?: string;
  parameters?: Record<string, string | number | boolean>;
}): Promise<AiGeneratedMedia> {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'project:edit');
  const state = useDirectorStore.getState();
  const project = state.project;
  const shot = getActiveShot(project);
  const profile = project.ai.profiles.find((item) => item.id === input.profileId);
  if (!profile) throw new Error(`AI profile ${input.profileId} not found.`);
  const frame = timeToFrame(state.playhead, shot.fps);
  const request = buildGenerationRequest(project, shot, input.task, frame, profile, input.prompt, input.negativePrompt ?? '', input.parameters ?? {});
  const generated = profile.provider === 'local-structural'
    ? generateLocalStructuralStoryboard(request)
    : await invokePdsAiEndpoint(profile, request, input.runtimeToken);
  if (generated.bytes && generated.record.uri?.startsWith('pds://ai/')) await putAiGeneratedMedia(generated.record.uri, generated.bytes, generated.record.mimeType);
  commitProject((next) => {
    if (next.ai.outputs.some((item) => item.id === generated.record.id)) throw new Error(`Generated output ${generated.record.id} already exists.`);
    next.ai.outputs.unshift(generated.record);
  });
  return generated.record;
}

export function approveAiOutput(outputId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'review:approve');
  commitProject((project) => {
    const output = project.ai.outputs.find((item) => item.id === outputId);
    if (!output) throw new Error(`AI output ${outputId} not found.`);
    if (output.status !== 'generated') throw new Error(`AI output ${outputId} is ${output.status}; only generated outputs can be approved.`);
    output.status = 'approved';
    output.approvedBy = identity.userId;
    output.approvedAt = new Date().toISOString();
  });
}

export function rejectAiOutput(outputId: string): void {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'review:approve');
  commitProject((project) => {
    const output = project.ai.outputs.find((item) => item.id === outputId);
    if (!output) throw new Error(`AI output ${outputId} not found.`);
    if (output.status !== 'generated') throw new Error(`AI output ${outputId} is ${output.status}; only generated outputs can be rejected.`);
    output.status = 'rejected';
    output.rejectedBy = identity.userId;
    output.rejectedAt = new Date().toISOString();
  });
}

export function promoteApprovedAiOutputToAsset(outputId: string): AssetRef {
  const identity = getSessionIdentity();
  requirePermission(identity.role, 'asset:register');
  const output = useDirectorStore.getState().project.ai.outputs.find((item) => item.id === outputId);
  if (!output) throw new Error(`AI output ${outputId} not found.`);
  if (output.status !== 'approved') throw new Error('AI media must be approved before Asset Registry promotion.');
  if (!output.uri) throw new Error('Approved AI output has no media URI.');
  const asset: AssetRef = {
    id: output.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name: `${output.task} · ${output.sourceShotId}`,
    category: output.task,
    version: 'v001',
    uri: output.uri,
    license: 'generated-project-use',
    owner: identity.userId,
    unitScaleMeters: 1,
    contentHashSha256: output.contentHashSha256,
    provenance: {
      source: 'generated',
      sourceUri: output.uri,
      recordedAt: output.generatedAt,
      recordedBy: output.approvedBy ?? identity.userId,
      parentAssetId: output.sourceShotId,
    },
    diagnostics: [{ severity: 'info', code: 'ai-provenance', message: `Generated by ${output.profile.modelId}@${output.profile.revision}; prompt ${output.promptHashSha256}; controls ${output.controlHashSha256}.` }],
  };
  return registerProjectAsset(asset);
}
