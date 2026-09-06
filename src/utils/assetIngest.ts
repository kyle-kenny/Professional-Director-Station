import type { AssetRef } from '../domain/model';

export type AssetSourceFormat = 'glb' | 'fbx';
export type AssetSourceUnit = 'meter' | 'centimeter' | 'millimeter' | 'inch' | 'foot';
export type AssetDiagnosticSeverity = 'info' | 'warning' | 'error';

export type AssetDiagnostic = {
  severity: AssetDiagnosticSeverity;
  code: string;
  message: string;
};

export type AssetInspection = {
  format: AssetSourceFormat | 'unsupported';
  fileName: string;
  sizeBytes: number;
  sourceUnitScaleMeters?: number;
  valid: boolean;
  diagnostics: AssetDiagnostic[];
  stats: {
    nodes?: number;
    meshes?: number;
    skins?: number;
    animations?: number;
    materials?: number;
    fbxVersion?: number;
  };
};

export type AssetRegistrationInput = {
  id: string;
  name: string;
  category: AssetRef['category'];
  version: string;
  license: string;
  owner: string;
};

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const FBX_BINARY_HEADER = 'Kaydara FBX Binary  ';

export const assetSourceUnits: Record<AssetSourceUnit, { label: string; meters: number }> = {
  meter: { label: 'meter (m)', meters: 1 },
  centimeter: { label: 'centimeter (cm)', meters: 0.01 },
  millimeter: { label: 'millimeter (mm)', meters: 0.001 },
  inch: { label: 'inch (in)', meters: 0.0254 },
  foot: { label: 'foot (ft)', meters: 0.3048 },
};

export function assetSourceUnitToMeters(unit: AssetSourceUnit): number {
  return assetSourceUnits[unit].meters;
}

export function assetFormatFromFileName(fileName: string): AssetSourceFormat | undefined {
  const extension = fileName.trim().toLowerCase().split('.').pop();
  return extension === 'glb' || extension === 'fbx' ? extension : undefined;
}

export function slugifyAssetId(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').normalize('NFKD').toLowerCase();
  const slug = stem.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  return slug || 'asset';
}

function inspectGlb(fileName: string, bytes: ArrayBuffer): AssetInspection {
  const diagnostics: AssetDiagnostic[] = [];
  const view = new DataView(bytes);
  let stats: AssetInspection['stats'] = {};
  if (bytes.byteLength < 20) {
    diagnostics.push({ severity: 'error', code: 'glb-truncated', message: 'GLB 文件小于最小头部长度。' });
    return { format: 'glb', fileName, sizeBytes: bytes.byteLength, sourceUnitScaleMeters: 1, valid: false, diagnostics, stats };
  }
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (magic !== GLB_MAGIC) diagnostics.push({ severity: 'error', code: 'glb-magic', message: '文件扩展名为 GLB，但缺少 glTF binary magic header。' });
  if (version !== 2) diagnostics.push({ severity: 'error', code: 'glb-version', message: `仅支持 glTF 2.0 GLB；检测到版本 ${version}。` });
  if (declaredLength !== bytes.byteLength) diagnostics.push({ severity: 'warning', code: 'glb-length', message: `GLB 声明长度 ${declaredLength} 与实际 ${bytes.byteLength} 不一致。` });

  const jsonLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    diagnostics.push({ severity: 'error', code: 'glb-json-chunk', message: 'GLB 缺少有效的首个 JSON chunk。' });
  } else {
    try {
      const jsonBytes = new Uint8Array(bytes, 20, jsonLength);
      const jsonText = new TextDecoder().decode(jsonBytes).replace(/[\u0000\u0020]+$/g, '');
      const json = JSON.parse(jsonText) as Record<string, any>;
      const gltfVersion = String(json.asset?.version ?? '');
      if (!gltfVersion.startsWith('2')) diagnostics.push({ severity: 'error', code: 'gltf-version', message: `GLB 内部 asset.version 不是 2.x：${gltfVersion || 'missing'}。` });
      stats = {
        nodes: Array.isArray(json.nodes) ? json.nodes.length : 0,
        meshes: Array.isArray(json.meshes) ? json.meshes.length : 0,
        skins: Array.isArray(json.skins) ? json.skins.length : 0,
        animations: Array.isArray(json.animations) ? json.animations.length : 0,
        materials: Array.isArray(json.materials) ? json.materials.length : 0,
      };
      const extensions = Array.isArray(json.extensionsUsed) ? json.extensionsUsed as string[] : [];
      if (extensions.includes('KHR_draco_mesh_compression')) diagnostics.push({ severity: 'warning', code: 'glb-draco', message: '资产使用 Draco 压缩；运行时需要 Draco decoder。' });
      diagnostics.push({ severity: 'info', code: 'glb-units', message: 'glTF 2.0 线性单位按规范视为米；导入比例为 1.0。' });
    } catch (error) {
      diagnostics.push({ severity: 'error', code: 'glb-json-parse', message: `GLB JSON chunk 解析失败：${error instanceof Error ? error.message : 'unknown'}` });
    }
  }
  return {
    format: 'glb', fileName, sizeBytes: bytes.byteLength, sourceUnitScaleMeters: 1,
    valid: !diagnostics.some((item) => item.severity === 'error'), diagnostics, stats,
  };
}

function inspectFbx(fileName: string, bytes: ArrayBuffer, sourceUnit?: AssetSourceUnit): AssetInspection {
  const diagnostics: AssetDiagnostic[] = [];
  const prefixBytes = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1024 * 1024));
  const prefix = new TextDecoder('utf-8', { fatal: false }).decode(prefixBytes);
  const binary = prefix.startsWith(FBX_BINARY_HEADER);
  let fbxVersion: number | undefined;
  let declaredUnitMeters: number | undefined;

  if (binary && bytes.byteLength >= 27) fbxVersion = new DataView(bytes).getUint32(23, true);
  if (!binary) {
    const versionMatch = prefix.match(/FBXVersion\s*:\s*(\d+)/i);
    if (versionMatch) fbxVersion = Number(versionMatch[1]);
    const unitMatch = prefix.match(/UnitScaleFactor\s*:\s*([-+\d.eE]+)/i);
    if (unitMatch) {
      const centimetersPerUnit = Number(unitMatch[1]);
      if (Number.isFinite(centimetersPerUnit) && centimetersPerUnit > 0) declaredUnitMeters = centimetersPerUnit / 100;
    }
  }

  if (!binary && !/FBXHeaderExtension/i.test(prefix)) diagnostics.push({ severity: 'error', code: 'fbx-header', message: '未识别有效的 ASCII/Binary FBX 头部。' });
  if (fbxVersion && fbxVersion < 7000) diagnostics.push({ severity: 'warning', code: 'fbx-legacy', message: `检测到较旧 FBX 版本 ${fbxVersion}；建议从 DCC 重新导出 FBX 7.x。` });

  if (!sourceUnit) {
    diagnostics.push({ severity: 'error', code: 'fbx-unit-required', message: 'FBX 必须显式确认来源单位；PDS 不会猜测厘米/米制。' });
    if (declaredUnitMeters) diagnostics.push({ severity: 'info', code: 'fbx-unit-declared', message: `文件头声明约 ${declaredUnitMeters}m/单位，仅作为参考，仍需人工确认。` });
  } else {
    const selectedMeters = assetSourceUnitToMeters(sourceUnit);
    if (declaredUnitMeters && Math.abs(declaredUnitMeters - selectedMeters) > 1e-6) {
      diagnostics.push({ severity: 'warning', code: 'fbx-unit-conflict', message: `FBX 声明单位约为 ${declaredUnitMeters}m/单位，但当前选择为 ${selectedMeters}m/单位。请确认来源 DCC 设置。` });
    }
    if (!declaredUnitMeters) diagnostics.push({ severity: 'warning', code: 'fbx-unit-explicit', message: '未可靠读取 FBX 单位；使用你显式选择的来源单位。' });
    diagnostics.push({ severity: 'info', code: 'fbx-normalize', message: `来源比例 ${selectedMeters}m/单位；PDS 资产引用规范化为米制 1:1。` });
  }

  return {
    format: 'fbx', fileName, sizeBytes: bytes.byteLength,
    sourceUnitScaleMeters: sourceUnit ? assetSourceUnitToMeters(sourceUnit) : undefined,
    valid: !diagnostics.some((item) => item.severity === 'error'), diagnostics, stats: { fbxVersion },
  };
}

export function inspectAssetBuffer(fileName: string, bytes: ArrayBuffer, fbxSourceUnit?: AssetSourceUnit): AssetInspection {
  const format = assetFormatFromFileName(fileName);
  if (!format) return {
    format: 'unsupported', fileName, sizeBytes: bytes.byteLength, valid: false,
    diagnostics: [{ severity: 'error', code: 'unsupported-format', message: 'Gate 1 仅接受 .glb 与 .fbx。' }], stats: {},
  };
  return format === 'glb' ? inspectGlb(fileName, bytes) : inspectFbx(fileName, bytes, fbxSourceUnit);
}

export function buildNormalizedAssetRef(input: AssetRegistrationInput, inspection: AssetInspection): AssetRef {
  if (!inspection.valid || inspection.format === 'unsupported' || !inspection.sourceUnitScaleMeters) {
    throw new Error('资产尚未通过导入诊断，不能注册到 Project Asset Registry。');
  }
  const extension = inspection.format;
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    version: input.version,
    uri: `assets/${input.id}/${input.version}/source.${extension}`,
    license: input.license.trim() || 'unknown',
    owner: input.owner.trim() || 'project',
    unitScaleMeters: 1,
    sourceFormat: inspection.format,
    sourceFileName: inspection.fileName,
    sourceSizeBytes: inspection.sizeBytes,
    sourceUnitScaleMeters: inspection.sourceUnitScaleMeters,
    diagnostics: inspection.diagnostics,
  };
}
