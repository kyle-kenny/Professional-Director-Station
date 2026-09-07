import { useMemo, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import { updatePipelineConfig } from '../store/pipelineRegistry';
import { shotToUsda, validatePdsUsda } from '../pipeline/usd';
import { materialAssignmentsToMtlx } from '../pipeline/materialx';
import { createAcesMetadataSidecar, serializeColorPipelineManifest, validateColorPipeline } from '../pipeline/color';
import { createDccAdapterManifest, createPipelinePackageManifest, type DccTarget } from '../pipeline/adapters';
import { exportShotToOtio } from '../editorial/otio';
import { planMediaProxy } from '../pipeline/mediaProxy';

const targets: DccTarget[] = ['blender', 'maya', 'houdini', 'unreal', 'nuke', 'resolve'];
const targetZh: Record<DccTarget, string> = { blender: 'Blender', maya: 'Maya', houdini: 'Houdini', unreal: 'Unreal Engine', nuke: 'Nuke', resolve: 'DaVinci Resolve' };

function downloadText(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PipelineWorkspace() {
  const project = useDirectorStore((state) => state.project);
  const shot = useDirectorStore((state) => state.getActiveShot());
  const [selectedTarget, setSelectedTarget] = useState<DccTarget>('blender');
  const usda = useMemo(() => shotToUsda(project, shot), [project, shot]);
  const mtlx = useMemo(() => materialAssignmentsToMtlx(project), [project]);
  const usdErrors = validatePdsUsda(usda);
  const colorErrors = validateColorPipeline(project);
  const videoProxy = planMediaProxy('reference/director-reference.mp4', 'video', project.pipeline.proxy, { width: 3840, height: 2160, bitrateMbps: 35 });

  const exportPackage = () => {
    downloadText(usda, `${project.id}-${shot.id}.usda`, 'text/plain');
    downloadText(exportShotToOtio(shot), `${project.id}-${shot.id}.otio`, 'application/json');
    downloadText(mtlx, `${project.id}.mtlx`, 'application/xml');
    downloadText(serializeColorPipelineManifest(project), 'pds-color.json', 'application/json');
    downloadText(createAcesMetadataSidecar(project), `${project.id}.amf.xml`, 'application/xml');
    downloadText(JSON.stringify(createPipelinePackageManifest(project), null, 2), `${project.id}.pipeline.json`, 'application/json');
  };

  return <div className="pipeline-page">
    <div className="pipeline-head"><span className="chip">制作管线互操作</span><strong>{project.pipeline.usdTarget}</strong><span>OCIO {project.pipeline.color.ocioVersion} · ACES {project.pipeline.color.acesVersion} · MaterialX {project.pipeline.materialXVersion}</span><button className="wide compact" onClick={exportPackage}>导出交换包</button></div>

    <div className="pipeline-grid">
      <section>
        <div className="section-title">OpenUSD 场景组合</div>
        <div className={`pipeline-state ${usdErrors.length ? 'bad' : 'ok'}`}>{usdErrors.length ? usdErrors.join('；') : 'USDA 1.0 · 每单位 1 米 · Y 轴向上 · 时间码使用镜头帧率'}</div>
        <pre>{usda.slice(0, 2400)}</pre>
        <button className="wide" onClick={() => downloadText(usda, `${shot.id}.usda`, 'text/plain')}>下载 USDA</button>
      </section>

      <section>
        <div className="section-title">OCIO / ACES 工程色彩</div>
        <label>OCIO 配置地址<input value={project.pipeline.color.ocioConfigUri} onChange={(e) => updatePipelineConfig((p) => { p.color.ocioConfigUri = e.target.value || 'ocio://studio/config.ocio'; })} /></label>
        <label>工作色彩空间<input value={project.pipeline.color.workingSpace} onChange={(e) => updatePipelineConfig((p) => { p.color.workingSpace = e.target.value || 'ACEScg'; })} /></label>
        <label>交换色彩空间<input value={project.pipeline.color.interchangeSpace} onChange={(e) => updatePipelineConfig((p) => { p.color.interchangeSpace = e.target.value || 'ACES2065-1'; })} /></label>
        <label>显示设备<input value={project.pipeline.color.display} onChange={(e) => updatePipelineConfig((p) => { p.color.display = e.target.value || 'sRGB - Display'; })} /></label>
        <label>观看变换<input value={project.pipeline.color.view} onChange={(e) => updatePipelineConfig((p) => { p.color.view = e.target.value || 'ACES 2.0 - SDR 100 nits'; })} /></label>
        <div className={`pipeline-state ${colorErrors.length ? 'bad' : 'ok'}`}>{colorErrors.length ? colorErrors.join('；') : '色彩合约有效'}</div>
        <div className="pipeline-button-row"><button onClick={() => downloadText(serializeColorPipelineManifest(project), 'pds-color.json', 'application/json')}>下载色彩清单</button><button onClick={() => downloadText(createAcesMetadataSidecar(project), `${project.id}.amf.xml`, 'application/xml')}>下载 ACES AMF 旁车文件</button></div>
      </section>

      <section>
        <div className="section-title">MaterialX 材质外观引用</div>
        <div className="pipeline-state ok">MaterialX {project.pipeline.materialXVersion} · 库版本 {project.pipeline.materialXLibraryRelease}</div>
        <pre>{mtlx.slice(0, 1800)}</pre>
        <button className="wide" onClick={() => downloadText(mtlx, `${project.id}.mtlx`, 'application/xml')}>下载 MaterialX</button>
      </section>

      <section>
        <div className="section-title">DCC / 后期软件适配</div>
        <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value as DccTarget)}>{targets.map((target) => <option key={target} value={target}>{targetZh[target]}</option>)}</select>
        <pre>{JSON.stringify(createDccAdapterManifest(project, selectedTarget), null, 2)}</pre>
        <button className="wide" onClick={() => downloadText(JSON.stringify(createDccAdapterManifest(project, selectedTarget), null, 2), `${project.id}.${selectedTarget}.json`, 'application/json')}>下载 {targetZh[selectedTarget]} 适配清单</button>
      </section>

      <section>
        <div className="section-title">存储 / 媒体代理策略</div>
        <label>存储根地址<input value={project.pipeline.storageRootUri} onChange={(e) => updatePipelineConfig((p) => { p.storageRootUri = e.target.value || 'pds://project'; })} /></label>
        <label>代理最大宽度<input type="number" value={project.pipeline.proxy.maxWidth} onChange={(e) => updatePipelineConfig((p) => { p.proxy.maxWidth = Math.max(320, Number(e.target.value)); })} /></label>
        <label>代理最大高度<input type="number" value={project.pipeline.proxy.maxHeight} onChange={(e) => updatePipelineConfig((p) => { p.proxy.maxHeight = Math.max(180, Number(e.target.value)); })} /></label>
        <label>目标码率 Mbps<input type="number" value={project.pipeline.proxy.targetBitrateMbps} onChange={(e) => updatePipelineConfig((p) => { p.proxy.targetBitrateMbps = Math.max(.1, Number(e.target.value)); })} /></label>
        <div className="proxy-card"><b>4K 参考片示例</b><span>{videoProxy.required ? `需要代理 · ${videoProxy.reason}` : '可直接使用原始媒体'}</span><code>{videoProxy.proxyUri}</code></div>
        <div className="meta">StorageProvider 将逻辑 URI 与实际 IndexedDB / 后续对象存储解耦；代理策略只生成派生媒体，不覆盖原始素材。</div>
      </section>
    </div>
  </div>;
}
