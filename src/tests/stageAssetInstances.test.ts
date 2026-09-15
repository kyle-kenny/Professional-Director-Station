import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { projectSchema, stageAssetInstanceSchema, type AssetRef } from '../domain/model';

const propAsset = (): AssetRef => ({
  id: 'chair-a', name: 'Chair A', category: 'prop', version: 'v001', uri: 'assets/chair-a/v001/source.glb',
  license: 'CC0-1.0', owner: 'test', unitScaleMeters: 1, contentHashSha256: 'a'.repeat(64),
  provenance: { source: 'import' }, sourceFormat: 'glb', sourceFileName: 'chair.glb', sourceSizeBytes: 128,
  sourceUnitScaleMeters: 1, diagnostics: [],
});

const instance = () => ({
  id: 'stage-chair-a', name: 'Chair A', kind: 'prop' as const, asset: propAsset(),
  transform: { position: { x: 1, y: 0, z: -2 }, rotation: { x: 0, y: 0.5, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  visible: true, castShadow: true, receiveShadow: true,
});

describe('PDS 1.9 Stage asset instances', () => {
  it('keeps environment/prop/vehicle instances authoritative inside the Shot', () => {
    const project = createDefaultProject();
    project.sequences[0].shots[0].stageAssets.push(stageAssetInstanceSchema.parse(instance()));
    const parsed = projectSchema.parse(project);
    const stored = parsed.sequences[0].shots[0].stageAssets[0];
    expect(stored.id).toBe('stage-chair-a');
    expect(stored.asset.id).toBe('chair-a');
    expect(stored.asset.contentHashSha256).toBe('a'.repeat(64));
    expect(stored.transform.position).toEqual({ x: 1, y: 0, z: -2 });
  });

  it('normalizes legacy pds-1 Shots without stageAssets to an empty collection', () => {
    const legacy = JSON.parse(JSON.stringify(createDefaultProject())) as any;
    delete legacy.sequences[0].shots[0].stageAssets;
    const parsed = projectSchema.parse(legacy);
    expect(parsed.schemaVersion).toBe('pds-1');
    expect(parsed.sequences[0].shots[0].stageAssets).toEqual([]);
  });

  it('rejects mismatched asset categories, non-importable sources and invalid scale', () => {
    const mismatch = instance();
    mismatch.asset = { ...mismatch.asset, category: 'environment' };
    expect(() => stageAssetInstanceSchema.parse(mismatch)).toThrow(/must match asset category/);

    const missingSource = instance();
    missingSource.asset = { ...missingSource.asset, sourceFormat: undefined };
    expect(() => stageAssetInstanceSchema.parse(missingSource)).toThrow(/require an imported GLB or FBX/);

    const invalidScale = instance();
    invalidScale.transform.scale.x = 0;
    expect(() => stageAssetInstanceSchema.parse(invalidScale)).toThrow();
  });
});
