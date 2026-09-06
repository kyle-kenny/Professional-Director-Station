import { describe, expect, it } from 'vitest';
import { aiModelProfileSchema, localStructuralProfile, type AiModelProfile } from '../domain/ai';
import { createDefaultProject } from '../domain/defaultProject';
import { projectSchema } from '../domain/model';
import { breakDownScript } from '../ai/scriptBreakdown';
import { analyzeFrameControls, controlBundleHash } from '../ai/controlAnalysis';
import { buildGenerationRequest, failedGenerationRecord, generateLocalStructuralStoryboard, invokePdsAiEndpoint } from '../ai/generation';
import { approveGeneratedMedia, approvedGeneratedMediaToAsset, rejectGeneratedMedia } from '../ai/provenance';
import { canonicalJson } from '../utils/sha256';

describe('Gate 5 AI production', () => {
  it('breaks screenplay text into deterministic structured scene candidates', () => {
    const source = `INT. KITCHEN - DAY\nALICE\nWe leave now.\n[PROP: red mug]\nAlice crosses to the door.\n\nEXT. STREET - NIGHT\nBOB\nWait.\nCars pass in rain.`;
    const first = breakDownScript(source, '2026-01-01T00:00:00.000Z');
    const second = breakDownScript(source, '2026-01-01T00:00:00.000Z');
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0].interiorExterior).toBe('INT');
    expect(first[0].characters).toContain('ALICE');
    expect(first[0].props).toContain('red mug');
    expect(first[1].interiorExterior).toBe('EXT');
    expect(first[0].sourceScriptHashSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives deterministic pose/depth/lineart/camera controls from the frame-authoritative Shot', () => {
    const shot = createDefaultProject().sequences[0].shots[0];
    const controls = analyzeFrameControls(shot, 0);
    expect(controls.pose).toHaveLength(shot.actors.length);
    expect(controls.depth).toHaveLength(shot.actors.length);
    expect(controls.lineart.every((item) => Number.isFinite(item.center.x) && Number.isFinite(item.center.y))).toBe(true);
    expect(controls.cameraReference.focalLengthMm).toBe(shot.camera.focalLengthMm);
    expect(controlBundleHash(controls)).toBe(controlBundleHash(analyzeFrameControls(shot, 0)));
  });

  it('creates a local structure-conditioned storyboard without mutating an Approved source Shot', () => {
    const project = createDefaultProject();
    const shot = project.sequences[0].shots[0];
    shot.status = 'APPROVED';
    const before = canonicalJson(shot);
    const request = buildGenerationRequest(project, shot, 'storyboard', 0, localStructuralProfile, 'Preserve blocking and lens.', 'No extra cast.');
    const generated = generateLocalStructuralStoryboard(request);
    expect(generated.record.status).toBe('generated');
    expect(generated.record.uri).toMatch(/^pds:\/\/ai\//);
    expect(generated.record.contentHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(generated.bytes)).toContain('PDS STRUCTURAL STORYBOARD');
    expect(canonicalJson(shot)).toBe(before);
    expect(generated.record.sourceShotHashSha256).toBe(request.source.shotHashSha256);
    expect(generated.record.controlHashSha256).toBe(request.controlHashSha256);
  });

  it('sends a sampled whole-Shot control sequence for video and keeps runtime credentials out of project data', async () => {
    const project = createDefaultProject();
    const shot = project.sequences[0].shots[0];
    const profile: AiModelProfile = { id: 'studio-video', label: 'Studio Video', provider: 'pds-http', endpoint: 'https://ai.example.test/v1/generate', modelId: 'video-x', revision: '2026-09', tasks: ['video'], defaultParameters: { seed: 42 }, enabled: true };
    const request = buildGenerationRequest(project, shot, 'video', 0, profile, 'Keep screen direction.', 'No topology changes.');
    expect(request.controlSequence?.length).toBeGreaterThan(1);
    expect(request.controlSequence?.[0].frame).toBe(0);
    expect(request.controlSequence?.at(-1)?.frame).toBe(Math.round(shot.duration * shot.fps));
    let sentBody = '';
    let sentAuth = '';
    const fakeFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = String(init?.body ?? '');
      sentAuth = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(JSON.stringify({ mediaBase64: btoa('video-bytes'), mimeType: 'video/mp4', jobId: 'job-1', seed: 42 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const generated = await invokePdsAiEndpoint(profile, request, 'runtime-secret', fakeFetch);
    expect(sentAuth).toBe('Bearer runtime-secret');
    expect(sentBody).not.toContain('runtime-secret');
    expect(JSON.stringify(profile)).not.toContain('runtime-secret');
    expect(generated.bytes?.length).toBeGreaterThan(0);
    expect(generated.record.providerJobId).toBe('job-1');
    expect(generated.record.profile.modelId).toBe('video-x');
  });

  it('records failed attempts with the same source, prompt and control provenance', () => {
    const project = createDefaultProject();
    const profile: AiModelProfile = { id: 'studio-video', label: 'Studio Video', provider: 'pds-http', endpoint: 'https://ai.example.test/v1/generate', modelId: 'video-x', revision: '1', tasks: ['video'], defaultParameters: {}, enabled: true };
    const request = buildGenerationRequest(project, project.sequences[0].shots[0], 'video', 0, profile, 'Keep lens.', 'No extra cast.');
    const failed = failedGenerationRecord(request, new Error('provider unavailable'), '2026-01-01T00:00:00.000Z');
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('provider unavailable');
    expect(failed.sourceShotHashSha256).toBe(request.source.shotHashSha256);
    expect(failed.promptHashSha256).toBe(request.promptHashSha256);
    expect(failed.controlHashSha256).toBe(request.controlHashSha256);
    expect(failed.profile).toEqual(request.profile);
  });

  it('rejects insecure non-local remote inference endpoints', () => {
    expect(() => aiModelProfileSchema.parse({ id: 'bad', label: 'Bad', provider: 'pds-http', endpoint: 'http://remote.example/generate', modelId: 'x', tasks: ['video'] })).toThrow();
    expect(() => aiModelProfileSchema.parse({ id: 'local', label: 'Local', provider: 'pds-http', endpoint: 'http://localhost:9000/generate', modelId: 'x', tasks: ['video'] })).not.toThrow();
  });

  it('requires director authority before generated media can become a production asset', () => {
    const project = createDefaultProject();
    const request = buildGenerationRequest(project, project.sequences[0].shots[0], 'storyboard', 0, localStructuralProfile, 'Reference.', '');
    const output = generateLocalStructuralStoryboard(request).record;
    expect(() => approveGeneratedMedia(output, 'editor-1', 'editor')).toThrow();
    const approved = approveGeneratedMedia(output, 'director-1', 'director', '2026-01-01T00:00:00.000Z');
    expect(approved.status).toBe('approved');
    const asset = approvedGeneratedMediaToAsset(approved, 'director-1');
    expect(asset.category).toBe('storyboard');
    expect(asset.provenance.source).toBe('generated');
    expect(asset.provenance.parentAssetId).toBe(output.sourceShotId);
    expect(asset.diagnostics[0].message).toContain(output.sourceShotHashSha256);
    expect(() => rejectGeneratedMedia(approved, 'director-1', 'director')).toThrow();
  });

  it('upgrades old pds-1 project JSON without AI production metadata', () => {
    const legacy: any = JSON.parse(JSON.stringify(createDefaultProject()));
    delete legacy.ai;
    const parsed = projectSchema.parse(legacy);
    expect(parsed.ai.profiles[0].id).toBe('local-structural-v1');
    expect(parsed.ai.sceneCandidates).toEqual([]);
    expect(parsed.ai.outputs).toEqual([]);
  });
});
