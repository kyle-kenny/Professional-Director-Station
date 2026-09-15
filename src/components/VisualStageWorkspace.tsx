import { ArrowLeftRight, Download, Image, Layers3, Play, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AiModelProfile } from '../domain/ai';
import { inspectComfyWorkflowJson } from '../ai/comfyWorkflow';
import { getAiGeneratedMedia } from '../storage/aiMediaStore';
import { generateAiMedia, upsertAiModelProfile } from '../store/aiRegistry';
import { useDirectorStore } from '../store/directorStore';
import {
  createStageVisualGenerationPreview,
  stageVisualOutputsForFrame,
} from '../ai/stageVisualGeneration';
import {
  createStageArtifact,
  createVisualFixture,
  createVisualStageLinkIntent,
  VISUAL_STAGE_UI,
  type VisualFixtureVariant,
  type VisualStageDirection,
} from '../domain/visualStage';

const variants: Array<{ id: VisualFixtureVariant; label: string; note: string }> = [
  { id: 'composition', label: '构图', note: '画幅、主体位置与视觉重心' },
  { id: 'lighting', label: '灯光', note: '主补轮廓关系与明暗层次' },
  { id: 'look', label: 'Look', note: '综合色调、材质、氛围与最终视觉方向' },
];

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function providerStem(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
}

function remoteProfileId(modelId: string): string {
  return `visual-${providerStem(modelId)}`;
}

function comfyProfileId(modelId: string): string {
  return `comfy-${providerStem(modelId)}`;
}

export function VisualStageWorkspace() {
  const project = useDirectorStore((state) => state.project);
  const sequenceId = useDirectorStore((state) => state.activeSequenceId);
  const shotId = useDirectorStore((state) => state.activeShotId);
  const playhead = useDirectorStore((state) => state.playhead);
  const [variant, setVariant] = useState<VisualFixtureVariant>('composition');
  const [direction, setDirection] = useState<VisualStageDirection>('stage-to-visual');
  const [profileId, setProfileId] = useState('');
  const [prompt, setPrompt] = useState('电影化成片参考；严格保持当前 Stage 的人物站位、镜头轴线、焦段与画幅。');
  const [negativePrompt, setNegativePrompt] = useState('不要增加演员，不要改变镜头轴线，不要重排场面调度。');
  const [runtimeToken, setRuntimeToken] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [modelId, setModelId] = useState('visual-model');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const [comfyBridgeEndpoint, setComfyBridgeEndpoint] = useState('http://127.0.0.1:8790/v1/generate');
  const [comfyBaseUrl, setComfyBaseUrl] = useState('http://127.0.0.1:8188');
  const [comfyModelId, setComfyModelId] = useState('comfyui-workflow');
  const [comfyWorkflowJson, setComfyWorkflowJson] = useState('');
  const [comfyWorkflowName, setComfyWorkflowName] = useState('');
  const [comfyPositiveNodeId, setComfyPositiveNodeId] = useState('');
  const [comfyNegativeNodeId, setComfyNegativeNodeId] = useState('');
  const [comfySeedNodeId, setComfySeedNodeId] = useState('');
  const [comfySizeNodeId, setComfySizeNodeId] = useState('');
  const [comfyControlNodeId, setComfyControlNodeId] = useState('');
  const [comfyPoseImageNodeId, setComfyPoseImageNodeId] = useState('');
  const [comfyDepthImageNodeId, setComfyDepthImageNodeId] = useState('');
  const [comfyLineartImageNodeId, setComfyLineartImageNodeId] = useState('');
  const [comfyOutputNodeId, setComfyOutputNodeId] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState('');

  const sequence = project.sequences.find((item) => item.id === sequenceId) ?? project.sequences[0];
  const shot = sequence.shots.find((item) => item.id === shotId) ?? sequence.shots[0];
  const frame = Math.max(0, Math.round(playhead * shot.fps));
  const stage = useMemo(() => createStageArtifact(project.id, sequence.id, shot, frame), [frame, project.id, sequence.id, shot]);
  const visual = useMemo(() => createVisualFixture(stage, variant), [stage, variant]);
  const intent = useMemo(() => createVisualStageLinkIntent(direction, visual, stage), [direction, stage, visual]);
  const eligibleProfiles = useMemo(() => project.ai.profiles.filter((profile) => profile.enabled && profile.tasks.includes('storyboard')), [project.ai.profiles]);
  const selectedProfile = eligibleProfiles.find((profile) => profile.id === profileId) ?? eligibleProfiles[0];
  const targetWidth = 1280;
  const targetHeight = Math.max(64, Math.round((targetWidth / Math.max(0.1, shot.frameAspect)) / 8) * 8);
  const generationParameters = useMemo<Record<string, string | number | boolean>>(() => ({
    visualTarget: variant,
    width: targetWidth,
    height: targetHeight,
  }), [targetHeight, variant]);
  const generationPreview = useMemo(() => selectedProfile
    ? createStageVisualGenerationPreview(project, sequence.id, shot, stage.frame, selectedProfile, variant, prompt, negativePrompt, generationParameters)
    : undefined, [generationParameters, negativePrompt, project, prompt, selectedProfile, sequence.id, shot, stage.frame, variant]);
  const outputs = useMemo(() => stageVisualOutputsForFrame(project.ai.outputs, shot.id, stage.frame, variant), [project.ai.outputs, shot.id, stage.frame, variant]);
  const selectedOutput = outputs.find((output) => output.id === selectedOutputId) ?? outputs[0];

  useEffect(() => {
    if (selectedProfile && selectedProfile.id !== profileId) setProfileId(selectedProfile.id);
  }, [profileId, selectedProfile]);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    Promise.all(outputs.filter((output) => output.uri?.startsWith('pds://ai/') && output.mimeType?.startsWith('image/')).map(async (output) => {
      const stored = output.uri ? await getAiGeneratedMedia(output.uri) : undefined;
      if (!stored) return undefined;
      const blobBytes = new Uint8Array(stored.bytes.byteLength);
      blobBytes.set(stored.bytes);
      const url = URL.createObjectURL(new Blob([blobBytes.buffer], { type: stored.contentType ?? output.mimeType }));
      created.push(url);
      return [output.id, url] as const;
    })).then((entries) => {
      if (!cancelled) setPreviewUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
    });
    return () => { cancelled = true; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [outputs]);

  const outputPreviewUrl = selectedOutput
    ? previewUrls[selectedOutput.id] ?? (selectedOutput.uri?.startsWith('http') && selectedOutput.mimeType?.startsWith('image/') ? selectedOutput.uri : undefined)
    : undefined;

  const doGenerate = async () => {
    if (!selectedProfile || !generationPreview || direction !== 'stage-to-visual') return;
    setBusy(true);
    setMessage('');
    try {
      const record = await generateAiMedia({
        profileId: selectedProfile.id,
        task: 'storyboard',
        prompt: generationPreview.request.prompt,
        negativePrompt: generationPreview.request.negativePrompt,
        runtimeToken,
        parameters: generationParameters,
      });
      setSelectedOutputId(record.id);
      setMessage(`Visual 已生成：${record.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Stage → Visual 生成失败。');
    } finally {
      setBusy(false);
    }
  };

  const addRemoteProfile = () => {
    try {
      const profile: AiModelProfile = {
        id: remoteProfileId(modelId),
        label: `Visual · ${modelId.trim() || 'visual-model'}`,
        provider: 'pds-http',
        endpoint: endpoint.trim(),
        modelId: modelId.trim() || 'visual-model',
        revision: '1',
        tasks: ['storyboard'],
        defaultParameters: {},
        enabled: true,
      };
      upsertAiModelProfile(profile);
      setProfileId(profile.id);
      setMessage(`已注册 ${profile.label}。访问令牌只保留在当前界面内存。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '远程 Visual provider 注册失败。');
    }
  };

  const applyComfyWorkflow = (text: string, name: string) => {
    const inspected = inspectComfyWorkflowJson(text);
    setComfyWorkflowJson(inspected.canonicalJson);
    setComfyWorkflowName(name);
    if (inspected.hints.positiveNodeId) setComfyPositiveNodeId(inspected.hints.positiveNodeId);
    if (inspected.hints.negativeNodeId) setComfyNegativeNodeId(inspected.hints.negativeNodeId);
    if (inspected.hints.seedNodeId) setComfySeedNodeId(inspected.hints.seedNodeId);
    if (inspected.hints.sizeNodeId) setComfySizeNodeId(inspected.hints.sizeNodeId);
    if (inspected.hints.controlNodeId) setComfyControlNodeId(inspected.hints.controlNodeId);
    if (inspected.hints.poseImageNodeId) setComfyPoseImageNodeId(inspected.hints.poseImageNodeId);
    if (inspected.hints.depthImageNodeId) setComfyDepthImageNodeId(inspected.hints.depthImageNodeId);
    if (inspected.hints.lineartImageNodeId) setComfyLineartImageNodeId(inspected.hints.lineartImageNodeId);
    if (inspected.hints.outputNodeId) setComfyOutputNodeId(inspected.hints.outputNodeId);
    const detected = Object.entries(inspected.hints).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(' · ');
    setMessage(detected ? `已载入 ${name}，自动识别：${detected}` : `已载入 ${name}；该工作流需要手动填写节点映射。`);
    return inspected;
  };

  const loadComfyWorkflow = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { applyComfyWorkflow(String(reader.result ?? ''), file.name); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'ComfyUI workflow JSON 无效。'); }
    };
    reader.readAsText(file);
  };

  const detectComfyNodes = () => {
    try { applyComfyWorkflow(comfyWorkflowJson, comfyWorkflowName || '手动粘贴 workflow'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'ComfyUI workflow JSON 无效。'); }
  };

  const addComfyProfile = () => {
    try {
      if (!comfyWorkflowJson.trim()) throw new Error('需要载入 ComfyUI API workflow JSON。');
      const inspected = inspectComfyWorkflowJson(comfyWorkflowJson);
      if (!comfyPositiveNodeId.trim()) throw new Error('需要填写 Positive Prompt 节点 ID。');
      const parameters: Record<string, string | number | boolean> = {
        comfyBaseUrl: comfyBaseUrl.trim(),
        workflowJson: inspected.canonicalJson,
        positiveNodeId: comfyPositiveNodeId.trim(),
        requestTimeoutMs: 300_000,
        comfyTimeoutMs: 270_000,
        comfyPollMs: 600,
        width: targetWidth,
        height: targetHeight,
      };
      if (comfyNegativeNodeId.trim()) parameters.negativeNodeId = comfyNegativeNodeId.trim();
      if (comfySeedNodeId.trim()) parameters.seedNodeId = comfySeedNodeId.trim();
      if (comfySizeNodeId.trim()) parameters.sizeNodeId = comfySizeNodeId.trim();
      if (comfyControlNodeId.trim()) parameters.controlNodeId = comfyControlNodeId.trim();
      if (comfyPoseImageNodeId.trim()) parameters.poseImageNodeId = comfyPoseImageNodeId.trim();
      if (comfyDepthImageNodeId.trim()) parameters.depthImageNodeId = comfyDepthImageNodeId.trim();
      if (comfyLineartImageNodeId.trim()) parameters.lineartImageNodeId = comfyLineartImageNodeId.trim();
      if (comfyOutputNodeId.trim()) parameters.outputNodeId = comfyOutputNodeId.trim();
      const profile: AiModelProfile = {
        id: comfyProfileId(comfyModelId),
        label: `ComfyUI · ${comfyModelId.trim() || 'workflow'}`,
        provider: 'pds-http',
        endpoint: comfyBridgeEndpoint.trim(),
        modelId: comfyModelId.trim() || 'comfyui-workflow',
        revision: '1',
        tasks: ['storyboard'],
        defaultParameters: parameters,
        enabled: true,
      };
      upsertAiModelProfile(profile);
      setProfileId(profile.id);
      const controlCount = [comfyPoseImageNodeId, comfyDepthImageNodeId, comfyLineartImageNodeId].filter((value) => value.trim()).length;
      setMessage(`已注册 ${profile.label}。生成时会通过 PDS Bridge 调用 ComfyUI${controlCount ? `，并上传 ${controlCount} 张 Stage 控制图` : ''}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ComfyUI Provider 注册失败。');
    }
  };

  const checkComfyBridge = async () => {
    setBridgeStatus('检查中…');
    try {
      const endpointUrl = new URL(comfyBridgeEndpoint);
      const response = await fetch(`${endpointUrl.origin}/health`);
      const payload = await response.json() as { ok?: boolean; provider?: string };
      if (!response.ok || !payload.ok) throw new Error('Bridge health check failed.');
      setBridgeStatus(`在线 · ${payload.provider ?? 'comfyui'}`);
    } catch {
      setBridgeStatus('离线 · 运行 npm run comfyui:bridge');
    }
  };

  return <div className="visual-stage-workspace">
    <header className="visual-stage-header">
      <div><span className="chip">PDS 1.7 · Stage Control Maps</span><h2>{VISUAL_STAGE_UI.workspace}</h2><p>把当前 Shot / Frame 的 Stage 状态转成结构化 AI 控制条件，并将 Pose / Depth / Lineart 栅格控制图真正上传到 ComfyUI 工作流。生成结果仍只作为可追溯媒体写回，不会自动改动 Stage。</p></div>
      <div className="visual-stage-frame"><b>{shot.name}</b><span>Frame {stage.frame}</span><small>{shot.fps} fps · {shot.frameAspect.toFixed(3)} · {targetWidth}×{targetHeight}</small></div>
    </header>

    <div className="visual-stage-flow">
      <section className="visual-stage-card visual-side">
        <div className="visual-stage-card-title"><Image size={17}/><div><strong>{VISUAL_STAGE_UI.visual}</strong><span>Generation target</span></div></div>
        <div className="visual-variant-grid">{variants.map((item) => <button key={item.id} className={variant === item.id ? 'active' : ''} onClick={() => { setVariant(item.id); setSelectedOutputId(''); }}><b>{item.label}</b><span>{item.note}</span></button>)}</div>
        <div className="artifact-readout"><span>Target</span><code>{visual.filename}</code><small>{outputs.length} generated result(s) for this exact Shot / Frame / variant</small></div>
      </section>

      <section className="visual-stage-bridge">
        <ArrowLeftRight size={24}/>
        <strong>{direction === 'visual-to-stage' ? VISUAL_STAGE_UI.visualToStage : VISUAL_STAGE_UI.stageToVisual}</strong>
        <div className="bridge-switch"><button className={direction === 'visual-to-stage' ? 'active' : ''} onClick={() => setDirection('visual-to-stage')}>Visual → Stage</button><button className={direction === 'stage-to-visual' ? 'active' : ''} onClick={() => setDirection('stage-to-visual')}>Stage → Visual</button></div>
        <span className={direction === 'stage-to-visual' ? 'live-badge' : 'draft-badge'}>{direction === 'stage-to-visual' ? 'CONTROL MAP READY' : 'PHASE 1 LINK'}</span>
      </section>

      <section className="visual-stage-card stage-side">
        <div className="visual-stage-card-title"><Layers3 size={17}/><div><strong>{VISUAL_STAGE_UI.stage}</strong><span>Authoritative frame snapshot</span></div></div>
        <div className="stage-metrics"><div><b>{stage.actors.length}</b><span>Actors</span></div><div><b>{stage.lights.length}</b><span>Lights</span></div><div><b>{stage.camera.focalLengthMm.toFixed(0)} mm</b><span>Lens</span></div></div>
        <div className="artifact-readout"><span>Control maps</span><code>Pose · Depth · Lineart</code><small>Pose uses frame-authoritative FK / IK projection; all maps follow the current Stage camera and frame.</small></div>
      </section>
    </div>

    <section className="stage-visual-generator">
      <div className="stage-visual-config">
        <div className="stage-visual-section-head"><div><strong>Stage → Visual Generation</strong><p>ComfyUI Provider 可把当前帧的 Stage 控制图上传到对应 LoadImage / ControlNet 链路。</p></div><span>{generationPreview?.schemaVersion ?? 'no-provider'}</span></div>
        <label><span>Provider</span><select aria-label="Visual provider" value={selectedProfile?.id ?? ''} onChange={(event) => setProfileId(event.target.value)}>{eligibleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.modelId}@{profile.revision}</option>)}</select></label>
        <label><span>Prompt</span><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)}/></label>
        <label><span>Negative</span><textarea rows={3} value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)}/></label>
        <label><span>Runtime token</span><input type="password" value={runtimeToken} onChange={(event) => setRuntimeToken(event.target.value)} placeholder="仅当前会话，不写入工程"/></label>
        <button className="generate-visual-button" disabled={busy || !selectedProfile || direction !== 'stage-to-visual'} onClick={() => void doGenerate()}><Play size={15}/>{busy ? '生成中…' : '生成 Visual'}</button>
        {direction !== 'stage-to-visual' && <small className="stage-visual-note">切换到 Stage → Visual 后才能执行生成；Visual → Stage 仍保持只读桥接。</small>}

        <details className="provider-register comfy-register">
          <summary><Plus size={13}/>添加 ComfyUI Provider</summary>
          <div className="comfy-register-body">
            <label><span>PDS Bridge</span><input value={comfyBridgeEndpoint} onChange={(event) => setComfyBridgeEndpoint(event.target.value)} placeholder="http://127.0.0.1:8790/v1/generate"/></label>
            <div className="comfy-health"><button onClick={() => void checkComfyBridge()}>检查 Bridge</button><span>{bridgeStatus || '运行 npm run comfyui:bridge'}</span></div>
            <label><span>ComfyUI</span><input value={comfyBaseUrl} onChange={(event) => setComfyBaseUrl(event.target.value)} placeholder="http://127.0.0.1:8188"/></label>
            <label><span>模型 / 工作流名</span><input value={comfyModelId} onChange={(event) => setComfyModelId(event.target.value)} placeholder="flux-controlnet-workflow"/></label>
            <label className="comfy-workflow-file"><span>API Workflow</span><input type="file" accept="application/json,.json" onChange={(event) => loadComfyWorkflow(event.target.files?.[0])}/><small>{comfyWorkflowName || '在 ComfyUI 中导出 API format JSON 后载入'}</small></label>
            <textarea rows={5} value={comfyWorkflowJson} onChange={(event) => { setComfyWorkflowJson(event.target.value); setComfyWorkflowName('手动粘贴'); }} placeholder="也可以直接粘贴 ComfyUI API workflow JSON"/>
            <div className="comfy-health"><button onClick={detectComfyNodes}>自动识别节点</button><span>给 LoadImage 节点命名 PDS Pose / PDS Depth / PDS Lineart 可自动识别</span></div>
            <div className="comfy-node-grid">
              <label><span>Positive *</span><input value={comfyPositiveNodeId} onChange={(event) => setComfyPositiveNodeId(event.target.value)} placeholder="node id"/></label>
              <label><span>Negative</span><input value={comfyNegativeNodeId} onChange={(event) => setComfyNegativeNodeId(event.target.value)} placeholder="node id"/></label>
              <label><span>Seed</span><input value={comfySeedNodeId} onChange={(event) => setComfySeedNodeId(event.target.value)} placeholder="KSampler node"/></label>
              <label><span>Size</span><input value={comfySizeNodeId} onChange={(event) => setComfySizeNodeId(event.target.value)} placeholder="latent node"/></label>
              <label><span>PDS Pose PNG</span><input value={comfyPoseImageNodeId} onChange={(event) => setComfyPoseImageNodeId(event.target.value)} placeholder="LoadImage node"/></label>
              <label><span>PDS Depth PNG</span><input value={comfyDepthImageNodeId} onChange={(event) => setComfyDepthImageNodeId(event.target.value)} placeholder="LoadImage node"/></label>
              <label><span>PDS Lineart PNG</span><input value={comfyLineartImageNodeId} onChange={(event) => setComfyLineartImageNodeId(event.target.value)} placeholder="LoadImage node"/></label>
              <label><span>PDS Control JSON</span><input value={comfyControlNodeId} onChange={(event) => setComfyControlNodeId(event.target.value)} placeholder="optional text node"/></label>
              <label><span>Output</span><input value={comfyOutputNodeId} onChange={(event) => setComfyOutputNodeId(event.target.value)} placeholder="optional SaveImage node"/></label>
            </div>
            <button onClick={addComfyProfile}>注册 ComfyUI Provider</button>
            <small className="stage-visual-note">填写任一控制图节点后，Bridge 会为当前 Shot / Frame 栅格化对应 PNG、上传到 ComfyUI input/pds-control，再写回该 LoadImage 节点。Workflow JSON 会保存在工程中，密码 / Bridge token 不会持久化。</small>
          </div>
        </details>

        <details className="provider-register"><summary><Plus size={13}/>添加通用 PDS-HTTP provider</summary><div><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://studio-ai.example/v1/generate"/><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="模型 ID"/><button onClick={addRemoteProfile}>注册远程 Provider</button></div></details>
        {message && <div className="stage-visual-message">{message}</div>}
      </div>

      <div className="stage-visual-result">
        <div className="stage-visual-section-head"><div><strong>Generated Visual</strong><p>只展示与当前 Shot / Frame / variant 精确匹配的结果。</p></div><span>{outputs.length} result(s)</span></div>
        {selectedOutput ? <>
          <div className="stage-visual-preview">{outputPreviewUrl ? <img src={outputPreviewUrl} alt="Stage Visual output"/> : <div className="stage-visual-empty"><Image size={28}/><span>{selectedOutput.status === 'failed' ? '生成失败，无预览' : 'Provider 返回了记录，但没有可显示的图片 URL'}</span></div>}</div>
          <div className="stage-visual-output-meta"><b>{selectedOutput.profile.modelId}@{selectedOutput.profile.revision}</b><span>{selectedOutput.status} · {selectedOutput.id}</span><small>prompt {selectedOutput.promptHashSha256.slice(0, 12)} · control {selectedOutput.controlHashSha256.slice(0, 12)}{selectedOutput.providerJobId ? ` · job ${selectedOutput.providerJobId}` : ''}</small>{selectedOutput.error && <small>错误：{selectedOutput.error}</small>}</div>
          {outputs.length > 1 && <div className="stage-visual-history">{outputs.map((output) => <button key={output.id} className={selectedOutput.id === output.id ? 'active' : ''} onClick={() => setSelectedOutputId(output.id)}>{output.generatedAt.slice(11, 19)} · {output.profile.modelId}</button>)}</div>}
        </> : <div className="stage-visual-preview"><div className="stage-visual-empty"><Image size={28}/><span>还没有当前帧的 {variant} Visual。点击“生成 Visual”开始。</span></div></div>}
      </div>
    </section>

    <section className="visual-stage-intent">
      <div><strong>Contract / Request Preview</strong><p>Visual 与 Stage 仍通过同一 Shot / Frame 契约绑定；ComfyUI Provider 收到的请求包含 FK / IK Pose 投影、Depth、Lineart、Camera、Lighting、variant 与目标尺寸。</p></div>
      <pre>{JSON.stringify(direction === 'stage-to-visual' && generationPreview ? generationPreview : intent, null, 2)}</pre>
      <div className="visual-stage-actions"><button onClick={() => downloadJson(stage.filename, stage)}><Download size={15}/>导出 Stage Artifact</button><button onClick={() => downloadJson(`${intent.id}.pds-link.json`, intent)}><Download size={15}/>导出 Link Intent</button>{generationPreview && <button onClick={() => downloadJson(`${shot.id}__stage-visual-request__f${String(stage.frame).padStart(6, '0')}.json`, generationPreview)}><Download size={15}/>导出 Generation Request</button>}</div>
    </section>
  </div>;
}
