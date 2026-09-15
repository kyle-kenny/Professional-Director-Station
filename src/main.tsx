import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { captureStageRenderPasses, stageRenderPassKinds } from './rendering/stageRenderPasses';
import { useDirectorStore } from './store/directorStore';
import { registerProjectAsset } from './store/assetRegistry';
import { addStageAssetInstance, setStageAssetTransform } from './store/stageAssetRegistry';
import { putAssetBinary } from './storage/assetBinaryStore';
import { sha256Bytes } from './utils/sha256';
import type { AssetRef } from './domain/model';
import './styles.css';
import './editorial.css';
import './review.css';
import './pipeline.css';
import './ai.css';
import './assets-workspace.css';
import './visual-stage.css';
import './integrity.css';
import './pose.css';
import './director-console.css';

type AuditPassSummary = Record<string, { prefix: string; base64Length: number; contentHashSha256: string }>;
type AuditCaptureSummary = { schema: string; shotId: string; frame: number; bundleHashSha256: string; passes: AuditPassSummary };

declare global {
  interface Window {
    __pdsAuditCaptureStageRenderPasses?: () => Promise<AuditCaptureSummary>;
    __pdsAuditSeedStageAsset?: () => Promise<{
      instanceId: string;
      stageAssetCount: number;
      assetHashSha256: string;
      beforeMaskHashSha256: string;
      afterMaskHashSha256: string;
      afterBundleHashSha256: string;
    }>;
  }
}

function summarizeBundle(bundle: Awaited<ReturnType<typeof captureStageRenderPasses>>): AuditCaptureSummary {
  return {
    schema: bundle.schema,
    shotId: bundle.shotId,
    frame: bundle.frame,
    bundleHashSha256: bundle.bundleHashSha256,
    passes: Object.fromEntries(stageRenderPassKinds.map((kind) => [kind, {
      prefix: bundle.passes[kind].dataBase64.slice(0, 12),
      base64Length: bundle.passes[kind].dataBase64.length,
      contentHashSha256: bundle.passes[kind].contentHashSha256,
    }])),
  };
}

function buildAuditPropGlb(): ArrayBuffer {
  const positions = [-0.85, 0, 0, 0.85, 0, 0, 0, 1.7, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  const binaryLength = (positions.length + normals.length) * 4;
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'PDS 1.9 audit' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'PDS Audit Prop' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, mode: 4 }] }],
    buffers: [{ byteLength: binaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4, target: 34962 },
      { buffer: 0, byteOffset: positions.length * 4, byteLength: normals.length * 4, target: 34962 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.85, 0, 0], max: [0.85, 1.7, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
    ],
  });
  const jsonBytes = new TextEncoder().encode(json);
  const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const totalLength = 12 + 8 + paddedJsonLength + 8 + binaryLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buffer);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + paddedJsonLength);
  const binHeader = 20 + paddedJsonLength;
  view.setUint32(binHeader, binaryLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  const floats = new Float32Array(buffer, binHeader + 8, positions.length + normals.length);
  floats.set(positions, 0);
  floats.set(normals, positions.length);
  return buffer;
}

if (new URLSearchParams(window.location.search).get('pds-audit') === '1') {
  window.__pdsAuditCaptureStageRenderPasses = async () => {
    const state = useDirectorStore.getState();
    const shot = state.getActiveShot();
    const frame = Math.max(0, Math.round(state.playhead * shot.fps));
    return summarizeBundle(await captureStageRenderPasses(shot, frame, 320, 180));
  };

  window.__pdsAuditSeedStageAsset = async () => {
    const beforeState = useDirectorStore.getState();
    const beforeShot = beforeState.getActiveShot();
    const frame = Math.max(0, Math.round(beforeState.playhead * beforeShot.fps));
    const before = await captureStageRenderPasses(beforeShot, frame, 320, 180);
    const bytes = buildAuditPropGlb();
    const hash = sha256Bytes(new Uint8Array(bytes));
    const asset: AssetRef = {
      id: 'audit-stage-prop', name: '审计三角道具', category: 'prop', version: 'v001',
      uri: 'assets/audit-stage-prop/v001/source.glb', license: 'CC0-1.0', owner: 'audit', unitScaleMeters: 1,
      contentHashSha256: hash,
      provenance: { source: 'derived', recordedAt: new Date().toISOString(), recordedBy: 'browser-audit' },
      sourceFormat: 'glb', sourceFileName: 'audit-stage-prop.glb', sourceSizeBytes: bytes.byteLength, sourceUnitScaleMeters: 1, diagnostics: [],
    };
    const file = new File([bytes], 'audit-stage-prop.glb', { type: 'model/gltf-binary' });
    await putAssetBinary(asset.id, asset.version, file, bytes);
    if (!beforeState.project.assets.some((item) => item.id === asset.id && item.version === asset.version)) registerProjectAsset(asset);
    let instance = useDirectorStore.getState().getActiveShot().stageAssets.find((item) => item.asset.id === asset.id && item.asset.version === asset.version);
    if (!instance) instance = addStageAssetInstance(asset.id, asset.version);
    setStageAssetTransform(instance.id, {
      position: { x: 0, y: 0.35, z: 2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    const afterState = useDirectorStore.getState();
    const afterShot = afterState.getActiveShot();
    const after = await captureStageRenderPasses(afterShot, frame, 320, 180);
    return {
      instanceId: instance.id,
      stageAssetCount: afterShot.stageAssets.length,
      assetHashSha256: hash,
      beforeMaskHashSha256: before.passes.sceneMask.contentHashSha256,
      afterMaskHashSha256: after.passes.sceneMask.contentHashSha256,
      afterBundleHashSha256: after.bundleHashSha256,
    };
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
