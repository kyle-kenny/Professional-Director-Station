import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { projectSchema } from '../domain/model';
import { createPipelinePackageManifest, createDccAdapterManifest } from '../pipeline/adapters';
import { colorPipelineFingerprint, createColorPipelineManifest, validateColorPipeline } from '../pipeline/color';
import { collectMaterialAssignments, materialAssignmentsToMtlx, parsePdsMaterialX } from '../pipeline/materialx';
import { planMediaProxy } from '../pipeline/mediaProxy';
import { parsePdsUsda, shotToUsda, validatePdsUsda } from '../pipeline/usd';
import { MemoryStorageProvider } from '../storage/storageProvider';

describe('Gate 4 pipeline interoperability', () => {
  it('round-trips a Shot through PDS USDA metadata at meter scale and Y-up', () => {
    const project = createDefaultProject();
    const shot = project.sequences[0].shots[0];
    const usda = shotToUsda(project, shot);
    expect(validatePdsUsda(usda)).toEqual([]);
    expect(usda).toContain('metersPerUnit = 1');
    expect(usda).toContain('upAxis = "Y"');
    expect(usda).toContain(`timeCodesPerSecond = ${shot.fps}`);
    const parsed = parsePdsUsda(usda);
    expect(parsed.projectId).toBe(project.id);
    expect(parsed.shot.id).toBe(shot.id);
    expect(parsed.shot.camera.focalLengthMm).toBe(shot.camera.focalLengthMm);
    expect(parsed.shot.actors.map((actor) => actor.id)).toEqual(shot.actors.map((actor) => actor.id));
  });

  it('round-trips MaterialX assignment identity for project assets', () => {
    const project = createDefaultProject();
    project.assets.push({
      id: 'chair', name: 'Chair', category: 'prop', version: 'v001', uri: 'assets/chair/v001/source.glb', license: 'CC0', owner: 'art',
      unitScaleMeters: 1, provenance: { source: 'import' }, diagnostics: [],
    });
    const assignments = collectMaterialAssignments(project);
    const xml = materialAssignmentsToMtlx(project, assignments);
    expect(xml).toContain('<materialx version="1.39">');
    const parsed = parsePdsMaterialX(xml);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].assetId).toBe('chair');
  });

  it('pins OCIO 2.5 / ACES 2.0 and creates stable adapter package fingerprints', () => {
    const project = createDefaultProject();
    expect(validateColorPipeline(project)).toEqual([]);
    const manifest = createColorPipelineManifest(project);
    expect(manifest.ocioVersion).toBe('2.5');
    expect(manifest.acesVersion).toBe('2.0');
    const first = colorPipelineFingerprint(project);
    const second = colorPipelineFingerprint(structuredClone(project));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    const pkg = createPipelinePackageManifest(project);
    expect(pkg.adapters).toHaveLength(6);
    for (const target of project.pipeline.dccTargets) {
      const adapter = createDccAdapterManifest(project, target);
      expect(adapter.coordinateConvention).toBe('right-handed,Y-up,-Z-forward,meter');
      expect(adapter.colorFingerprintSha256).toBe(first);
      expect(adapter.sceneUri.endsWith('.usda')).toBe(true);
    }
  });

  it('makes deterministic proxy decisions from the project policy', () => {
    const project = createDefaultProject();
    const policy = project.pipeline.proxy;
    const high = planMediaProxy('pds://media/source.mov', 'video', policy, { width: 3840, height: 2160, bitrateMbps: 80 });
    expect(high.required).toBe(true);
    expect(high.reason).toContain('resolution');
    expect(high.reason).toContain('bitrate');
    const within = planMediaProxy('pds://media/source.mp4', 'video', policy, { width: 1280, height: 720, bitrateMbps: 4 });
    expect(within.required).toBe(false);
    expect(within.reason).toBe('within-policy');
  });

  it('keeps storage-provider writes isolated from caller mutation', async () => {
    const storage = new MemoryStorageProvider();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put('memory://project/interchange/a.usda', bytes, 'text/plain');
    bytes[0] = 99;
    const stored = await storage.get('memory://project/interchange/a.usda');
    expect(stored?.bytes[0]).toBe(1);
    stored!.bytes[1] = 88;
    const reread = await storage.get('memory://project/interchange/a.usda');
    expect(reread?.bytes[1]).toBe(2);
    expect(await storage.list('memory://project/interchange/')).toEqual(['memory://project/interchange/a.usda']);
  });

  it('upgrades old pds-1 JSON without pipeline metadata to current defaults', () => {
    const legacy: any = JSON.parse(JSON.stringify(createDefaultProject()));
    delete legacy.pipeline;
    const parsed = projectSchema.parse(legacy);
    expect(parsed.pipeline.usdTarget).toBe('OpenUSD-26.08');
    expect(parsed.pipeline.color.ocioVersion).toBe('2.5');
    expect(parsed.pipeline.color.acesVersion).toBe('2.0');
    expect(parsed.pipeline.materialXVersion).toBe('1.39');
  });
});
