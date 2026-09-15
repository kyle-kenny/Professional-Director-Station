import { describe, expect, it } from 'vitest';
import { buildGenerationRequest } from '../ai/generation';
import { createDefaultProject } from '../domain/defaultProject';
import type { AiModelProfile } from '../domain/ai';
import { buildSceneEdgePixels, type StageRenderPassBundle, type StageRenderPassKind } from '../rendering/stageRenderPasses';

function rgba(width: number, height: number, value: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(value, offset);
  return pixels;
}

function fakeBundle(shotId: string, frame: number, hash = 'a'.repeat(64)): StageRenderPassBundle {
  const pass = (kind: StageRenderPassKind) => ({
    kind,
    mimeType: 'image/png' as const,
    width: 1280,
    height: 720,
    dataBase64: 'iVBORw0KGgo=',
    contentHashSha256: hash,
  });
  return {
    schema: 'pds-stage-render-passes-1',
    shotId,
    frame,
    width: 1280,
    height: 720,
    bundleHashSha256: hash,
    passes: {
      sceneDepth: pass('sceneDepth'),
      sceneNormal: pass('sceneNormal'),
      sceneMask: pass('sceneMask'),
      sceneEdge: pass('sceneEdge'),
    },
  };
}

describe('PDS 1.8 Stage render passes', () => {
  it('keeps a flat depth/normal field edge-free and exposes discontinuities', () => {
    const width = 4, height = 3;
    const depth = rgba(width, height, [120, 120, 120, 255]);
    const normal = rgba(width, height, [128, 128, 255, 255]);
    const flat = buildSceneEdgePixels(depth, normal, width, height);
    expect(Array.from(flat).filter((_, index) => index % 4 !== 3).every((value) => value === 0)).toBe(true);

    const changedDepth = new Uint8ClampedArray(depth);
    const rightPixel = (1 * width + 2) * 4;
    changedDepth[rightPixel] = 240;
    changedDepth[rightPixel + 1] = 240;
    changedDepth[rightPixel + 2] = 240;
    const edged = buildSceneEdgePixels(changedDepth, normal, width, height);
    expect(edged.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
  });

  it('adds the transient render-pass bundle to control provenance without persisting it in profile parameters', () => {
    const project = createDefaultProject();
    const shot = project.sequences[0].shots[0];
    const profile: AiModelProfile = {
      id: 'comfy-scene', label: 'Comfy Scene', provider: 'pds-http', endpoint: 'http://127.0.0.1:8790/v1/generate',
      modelId: 'flux-scene', revision: '1', tasks: ['storyboard'], defaultParameters: { sceneDepthImageNodeId: '14' }, enabled: true,
    };
    const without = buildGenerationRequest(project, shot, 'storyboard', 0, profile, 'frame');
    const bundle = fakeBundle(shot.id, 0);
    const withPasses = buildGenerationRequest(project, shot, 'storyboard', 0, profile, 'frame', '', {}, bundle);
    expect(withPasses.renderPasses).toEqual(bundle);
    expect(withPasses.controlHashSha256).not.toBe(without.controlHashSha256);
    expect(JSON.stringify(withPasses.profile.parameters)).not.toContain('dataBase64');
    expect(() => buildGenerationRequest(project, shot, 'storyboard', 0, profile, 'frame', '', {}, fakeBundle('wrong-shot', 0))).toThrow(/exact Shot and frame/);
    expect(() => buildGenerationRequest(project, shot, 'storyboard', 0, profile, 'frame', '', {}, fakeBundle(shot.id, 1))).toThrow(/exact Shot and frame/);
  });
});
