import { useEffect, useMemo, useState } from 'react';
import type { AssetRef } from '../domain/model';
import { useDirectorStore } from '../store/directorStore';
import { registerProjectAsset, unregisterProjectAsset, uniqueAssetId, validateProjectAssetCandidate } from '../store/assetRegistry';
import { deleteAssetBinary, hasAssetBinary, putAssetBinary } from '../storage/assetBinaryStore';
import { sha256Bytes } from '../utils/sha256';
import {
  MAX_ASSET_INGEST_BYTES,
  assetFormatFromFileName,
  assetSourceUnits,
  buildNormalizedAssetRef,
  inspectAssetBuffer,
  slugifyAssetId,
  type AssetInspection,
  type AssetSourceUnit,
} from '../utils/assetIngest';

const categories: AssetRef['category'][] = ['character', 'environment', 'prop', 'vehicle'];
type CacheState = 'checking' | 'cached' | 'missing' | 'unavailable';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

const assetKey = (asset: Pick<AssetRef, 'id' | 'version'>) => `${asset.id}@${asset.version}`;

export function AssetLibraryPanel() {
  const assets = useDirectorStore((state) => state.project.assets);
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [inspection, setInspection] = useState<AssetInspection | null>(null);
  const [fbxUnit, setFbxUnit] = useState<AssetSourceUnit | ''>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [cache, setCache] = useState<Record<string, CacheState>>({});
  const [form, setForm] = useState({ id: '', name: '', category: 'prop' as AssetRef['category'], version: 'v001', license: 'unknown', owner: 'project' });

  useEffect(() => {
    let cancelled = false;
    const initial: Record<string, CacheState> = {};
    assets.forEach((asset) => { initial[assetKey(asset)] = 'checking'; });
    setCache(initial);
    Promise.all(assets.map(async (asset) => {
      try {
        const exists = await hasAssetBinary(asset.id, asset.version);
        return [assetKey(asset), exists ? 'cached' : 'missing'] as const;
      } catch {
        return [assetKey(asset), 'unavailable'] as const;
      }
    })).then((entries) => { if (!cancelled) setCache(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [assets]);

  useEffect(() => {
    if (!file || !bytes || assetFormatFromFileName(file.name) !== 'fbx') return;
    setInspection(inspectAssetBuffer(file.name, bytes, fbxUnit || undefined));
  }, [file, bytes, fbxUnit]);

  const stats = useMemo(() => inspection ? Object.entries(inspection.stats).filter(([, value]) => value !== undefined) : [], [inspection]);

  const chooseFile = async (next?: File) => {
    setMessage(null);
    setFbxUnit('');
    setInspection(null);
    setBytes(null);
    setFile(next ?? null);
    if (!next) return;
    const format = assetFormatFromFileName(next.name);
    const preferred = uniqueAssetId(slugifyAssetId(next.name), assets);
    setForm((current) => ({ ...current, id: preferred, name: next.name.replace(/\.[^.]+$/, ''), version: 'v001' }));
    if (!format) { setMessage({ kind: 'error', text: '仅支持 .glb 与 .fbx 文件。' }); return; }
    if (next.size > MAX_ASSET_INGEST_BYTES) { setMessage({ kind: 'error', text: `文件 ${formatBytes(next.size)} 超过浏览器版 512 MiB 单资产上限。` }); return; }
    try {
      const buffer = await next.arrayBuffer();
      setBytes(buffer);
      setInspection(inspectAssetBuffer(next.name, buffer));
    } catch (error) {
      setMessage({ kind: 'error', text: `读取资产失败：${error instanceof Error ? error.message : 'unknown error'}` });
    }
  };

  const importAsset = async () => {
    if (!file || !bytes || !inspection?.valid) return;
    setBusy(true);
    setMessage(null);
    let wroteBinary = false;
    try {
      const contentHashSha256 = sha256Bytes(new Uint8Array(bytes));
      const candidate = buildNormalizedAssetRef({ ...form, contentHashSha256, recordedBy: 'local-owner' }, inspection);
      validateProjectAssetCandidate(candidate, assets);
      await putAssetBinary(candidate.id, candidate.version, file, bytes);
      wroteBinary = true;
      registerProjectAsset(candidate);
      setMessage({ kind: 'ok', text: `${candidate.id}@${candidate.version} 已注册；SHA-256 ${contentHashSha256.slice(0, 12)}…` });
      setFile(null); setBytes(null); setInspection(null); setFbxUnit('');
    } catch (error) {
      if (wroteBinary) await deleteAssetBinary(form.id, form.version).catch(() => undefined);
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '资产导入失败。' });
    } finally { setBusy(false); }
  };

  const removeAsset = (asset: AssetRef) => {
    unregisterProjectAsset(asset.id, asset.version);
    setMessage({ kind: 'ok', text: `${asset.id}@${asset.version} 已移出 Registry；本地二进制保留，可通过 Undo 恢复引用。` });
  };

  return <section className="asset-library">
    <div className="section-title">ASSET INGEST · GLB / FBX</div>
    <label className="asset-file-picker"><span>{file ? file.name : '选择 GLB / FBX…'}</span><input type="file" accept=".glb,.fbx,model/gltf-binary,application/octet-stream" onChange={(event) => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void chooseFile(selected); }} /></label>

    {file && <div className="asset-form">
      <label><span>Asset ID</span><input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value.trim().toLowerCase() })} /></label>
      <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as AssetRef['category'] })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label><span>Version</span><input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></label>
      <label><span>License</span><input value={form.license} onChange={(event) => setForm({ ...form, license: event.target.value })} /></label>
      <label><span>Owner</span><input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} /></label>
      {assetFormatFromFileName(file.name) === 'fbx' && <label><span>FBX 来源单位 *</span><select value={fbxUnit} onChange={(event) => setFbxUnit(event.target.value as AssetSourceUnit | '')}><option value="">必须显式确认…</option>{Object.entries(assetSourceUnits).map(([id, unit]) => <option key={id} value={id}>{unit.label}</option>)}</select></label>}
    </div>}

    {inspection && <div className={`asset-inspection ${inspection.valid ? 'valid' : 'invalid'}`}>
      <div className="asset-inspection-head"><strong>{inspection.format.toUpperCase()}</strong><span>{formatBytes(inspection.sizeBytes)}</span><span>{inspection.valid ? 'PASS' : 'BLOCKED'}</span></div>
      {stats.length > 0 && <div className="asset-stats">{stats.map(([name, value]) => <span key={name}>{name}: {value}</span>)}</div>}
      <div className="diagnostics">{inspection.diagnostics.map((item, index) => <div className={`diagnostic ${item.severity}`} key={`${item.code}-${index}`}><b>{item.severity.toUpperCase()}</b><span>{item.message}</span></div>)}</div>
    </div>}

    {file && <button className="wide" disabled={busy || !inspection?.valid} onClick={() => void importAsset()}>{busy ? '正在计算哈希并写入缓存…' : '导入、校验并注册资产'}</button>}
    {message && <div className={`asset-message ${message.kind}`}>{message.text}</div>}
    <div className="meta">内部标准：Right-handed · Y-up · -Z forward · meter 1:1。原始二进制存 IndexedDB；Registry 保存 SHA-256、license 与 provenance，Project JSON 不内嵌二进制。</div>

    <div className="section-title">PROJECT ASSET REGISTRY · {assets.length}</div>
    <div className="asset-registry-list">
      {assets.length === 0 && <div className="meta">当前工程尚无已注册资产。</div>}
      {assets.map((asset) => {
        const state = cache[assetKey(asset)] ?? 'checking';
        const warnings = asset.diagnostics.filter((item) => item.severity === 'warning').length;
        return <div className="asset-card" key={assetKey(asset)}>
          <div><strong>{asset.name}</strong><span>{asset.id}@{asset.version}</span></div>
          <div className="asset-card-meta"><span>{asset.category}</span><span>{asset.sourceFormat?.toUpperCase() ?? 'REF'}</span><span className={`cache-state ${state}`}>{state}</span></div>
          <div className="meta">{asset.sourceFileName ?? asset.uri}<br />SHA-256: {asset.contentHashSha256 ? `${asset.contentHashSha256.slice(0, 20)}…` : 'legacy / unavailable'}<br />license: {asset.license} · provenance: {asset.provenance?.source ?? 'unknown'} · source scale: {asset.sourceUnitScaleMeters ?? 1}m/u → PDS 1m/u{warnings ? ` · ${warnings} warning(s)` : ''}</div>
          <button className="wide danger" onClick={() => removeAsset(asset)}>移出 Registry（保留缓存）</button>
        </div>;
      })}
    </div>
  </section>;
}
