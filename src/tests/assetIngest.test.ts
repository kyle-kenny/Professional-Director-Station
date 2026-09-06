import { describe, expect, it } from 'vitest';
import type { AssetRef } from '../domain/model';
import { assetBinaryKey } from '../storage/assetBinaryStore';
import { uniqueAssetId, validateProjectAssetCandidate } from '../store/assetRegistry';
import {
  assetSourceUnitToMeters,
  buildNormalizedAssetRef,
  inspectAssetBuffer,
  slugifyAssetId,
} from '../utils/assetIngest';

function createMinimalGlb(): ArrayBuffer {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    nodes: [{ name: 'Root' }],
    meshes: [{ primitives: [] }],
    materials: [{}],
    animations: [{}],
  });
  const encoded = new TextEncoder().encode(json);
  const paddedLength = Math.ceil(encoded.byteLength / 4) * 4;
  const totalLength = 20 + paddedLength;
  const bytes = new ArrayBuffer(totalLength);
  const view = new DataView(bytes);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  const target = new Uint8Array(bytes, 20, paddedLength);
  target.fill(0x20);
  target.set(encoded);
  return bytes;
}

function createAsciiFbx(): ArrayBuffer {
  const source = `; FBX 7.4.0 project file\nFBXHeaderExtension: {\n FBXVersion: 7400\n}\nGlobalSettings: {\n UnitScaleFactor: 1\n}\n`;
  return new TextEncoder().encode(source).buffer;
}

const registration = {
  id: 'hero-character',
  name: 'Hero Character',
  category: 'character' as const,
  version: 'v001',
  license: 'internal',
  owner: 'project',
};

describe('Gate 1 asset ingest', () => {
  it('parses a glTF 2.0 GLB header and structural stats', () => {
    const inspection = inspectAssetBuffer('hero.glb', createMinimalGlb());
    expect(inspection.valid).toBe(true);
    expect(inspection.format).toBe('glb');
    expect(inspection.sourceUnitScaleMeters).toBe(1);
    expect(inspection.stats.nodes).toBe(1);
    expect(inspection.stats.meshes).toBe(1);
    expect(inspection.stats.materials).toBe(1);
    expect(inspection.stats.animations).toBe(1);
  });

  it('blocks FBX until source units are explicitly confirmed', () => {
    const bytes = createAsciiFbx();
    const blocked = inspectAssetBuffer('hero.fbx', bytes);
    expect(blocked.valid).toBe(false);
    expect(blocked.diagnostics.some((item) => item.code === 'fbx-unit-required')).toBe(true);

    const confirmed = inspectAssetBuffer('hero.fbx', bytes, 'centimeter');
    expect(confirmed.valid).toBe(true);
    expect(confirmed.sourceUnitScaleMeters).toBe(0.01);
    expect(confirmed.stats.fbxVersion).toBe(7400);
  });

  it('normalizes registered asset references to PDS meter 1:1', () => {
    const inspection = inspectAssetBuffer('hero.fbx', createAsciiFbx(), 'centimeter');
    const asset = buildNormalizedAssetRef(registration, inspection);
    expect(asset.unitScaleMeters).toBe(1);
    expect(asset.sourceUnitScaleMeters).toBe(0.01);
    expect(asset.uri).toBe('assets/hero-character/v001/source.fbx');
    expect(asset.sourceFormat).toBe('fbx');
    expect(validateProjectAssetCandidate(asset, [])).toEqual(asset);
  });

  it('rejects malformed or unsupported assets', () => {
    expect(inspectAssetBuffer('bad.glb', new ArrayBuffer(8)).valid).toBe(false);
    const unsupported = inspectAssetBuffer('bad.obj', new ArrayBuffer(32));
    expect(unsupported.valid).toBe(false);
    expect(unsupported.format).toBe('unsupported');
    expect(() => buildNormalizedAssetRef(registration, unsupported)).toThrow();
  });

  it('keeps stable asset ids, versions and cache keys', () => {
    expect(slugifyAssetId('Hero Character FINAL.glb')).toBe('hero-character-final');
    expect(assetSourceUnitToMeters('inch')).toBeCloseTo(0.0254, 8);
    expect(assetBinaryKey('hero-character', 'v002')).toBe('hero-character@v002');
    const existing = [{ ...buildNormalizedAssetRef(registration, inspectAssetBuffer('hero.glb', createMinimalGlb())), id: 'hero-character' }] as AssetRef[];
    expect(uniqueAssetId('hero-character', existing)).toBe('hero-character-2');
    expect(() => validateProjectAssetCandidate(existing[0], existing)).toThrow(/已存在/);
  });
});
