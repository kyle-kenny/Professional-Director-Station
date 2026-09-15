import { ArrowLeftRight, Download, Image, Layers3, Play, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AiModelProfile } from '../domain/ai';
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

function remoteProfileId(modelId: string): string {
  const stem = modelId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
  return `visual-${stem}`;
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

  const sequence = project.sequences.find((item) => item.id === sequenceId) ?? project.sequences[0];
  const shot = sequence.shots.find((item) => item.id === shotId) ?? sequence.shots[0];
  const frame = Math.max(0, Math.round(playhead * shot.fps));
  const stage = useMemo(() => createStageArtifact(project.id, sequence.id, shot, frame), [frame, project.id, sequence.id, shot]);
  const visual = useMemo(() => createVisualFixture(stage, variant), [stage, variant]);
  const intent = useMemo(() => createVisualStageLinkIntent(direction, visual, stage), [direction, stage, visual]);
  const eligibleProfiles = useMemo(() => project.ai.profiles.filter((profile) => profile.enabled && profile.tasks.includes('storyboard')), [project.ai.profiles]);
  const selectedProfile = eligibleProfiles.find((profile) => profile.id === profileId) ?? eligibleProfiles[0];
  const generationPreview = useMemo(() => selectedProfile
    ? createStageVisualGenerationPreview(project, sequence.id, shot, stage.frame, selectedProfile, variant, prompt, negativePrompt)
    : undefined, [negativePrompt, profileId, project, prompt, selectedProfile, sequence.id, shot, stage.frame, variant]);
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

  return <div className="visual-stage-workspace">
    <header className="visual-stage-header">
      <div><span className="chip">PDS 1.5 · Stage → Visual</span><h2>{VISUAL_STAGE_UI.workspace}</h2><p>把当前 Shot / Frame 的 Stage 状态转成结构化 AI 控制条件并生成 Visual。生成结果只新增为可追溯媒体，不会自动改动 Stage。</p></div>
      <div className="visual-stage-frame"><b>{shot.name}</b><span>Frame {stage.frame}</span><small>{shot.fps} fps · {shot.frameAspect.toFixed(3)}</small></div>
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
        <span className={direction === 'stage-to-visual' ? 'live-badge' : 'draft-badge'}>{direction === 'stage-to-visual' ? 'GENERATION READY' : 'PHASE 1 LINK'}</span>
      </section>

      <section className="visual-stage-card stage-side">
        <div className="visual-stage-card-title"><Layers3 size={17}/><div><strong>{VISUAL_STAGE_UI.stage}</strong><span>Authoritative frame snapshot</span></div></div>
        <div className="stage-metrics"><div><b>{stage.actors.length}</b><span>Actors</span></div><div><b>{stage.lights.length}</b><span>Lights</span></div><div><b>{stage.camera.focalLengthMm.toFixed(0)} mm</b><span>Lens</span></div></div>
        <div className="artifact-readout"><span>Artifact</span><code>{stage.filename}</code><small>Pose / camera / lighting are sampled from the current frame.</small></div>
      </section>
    </div>

    <section className="stage-visual-generator">
      <div className="stage-visual-config">
        <div className="stage-visual-section-head"><div><strong>Stage → Visual Generation</strong><p>本地结构预览用于零配置验证；PDS-HTTP provider 可接真实图片生成服务。</p></div><span>{generationPreview?.schemaVersion ?? 'no-provider'}</span></div>
        <label><span>Provider</span><select aria-label="Visual provider" value={selectedProfile?.id ?? ''} onChange={(event) => setProfileId(event.target.value)}>{eligibleProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.modelId}@{profile.revision}</option>)}</select></label>
        <label><span>Prompt</span><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)}/></label>
        <label><span>Negative</span><textarea rows={3} value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)}/></label>
        <label><span>Runtime token</span><input type="password" value={runtimeToken} onChange={(event) => setRuntimeToken(event.target.value)} placeholder="仅当前会话，不写入工程"/></label>
        <button className="generate-visual-button" disabled={busy || !selectedProfile || direction !== 'stage-to-visual'} onClick={() => void doGenerate()}><Play size={15}/>{busy ? '生成中…' : '生成 Visual'}</button>
        {direction !== 'stage-to-visual' && <small className="stage-visual-note">切换到 Stage → Visual 后才能执行生成；Visual → Stage 仍保持只读桥接。</small>}
        <details className="provider-register"><summary><Plus size={13}/>添加 PDS-HTTP provider</summary><div><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://studio-ai.example/v1/generate"/><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="模型 ID"/><button onClick={addRemoteProfile}>注册远程 Provider</button></div></details>
        {message && <div className="stage-visual-message">{message}</div>}
      </div>

      <div className="stage-visual-result">
        <div className="stage-visual-section-head"><div><strong>Generated Visual</strong><p>只展示与当前 Shot / Frame / variant 精确匹配的结果。</p></div><span>{outputs.length} result(s)</span></div>
        {selectedOutput ? <>
          <div className="stage-visual-preview">{outputPreviewUrl ? <img src={outputPreviewUrl} alt="Stage Visual output"/> : <div className="stage-visual-empty"><Image size={28}/><span>{selectedOutput.status === 'failed' ? '生成失败，无预览' : 'Provider 返回了记录，但没有可显示的图片 URL'}</span></div>}</div>
          <div className="stage-visual-output-meta"><b>{selectedOutput.profile.modelId}@{selectedOutput.profile.revision}</b><span>{selectedOutput.status} · {selectedOutput.id}</span><small>prompt {selectedOutput.promptHashSha256.slice(0, 12)} · control {selectedOutput.controlHashSha256.slice(0, 12)}</small>{selectedOutput.error && <small>错误：{selectedOutput.error}</small>}</div>
          {outputs.length > 1 && <div className="stage-visual-history">{outputs.map((output) => <button key={output.id} className={selectedOutput.id === output.id ? 'active' : ''} onClick={() => setSelectedOutputId(output.id)}>{output.generatedAt.slice(11, 19)} · {output.profile.modelId}</button>)}</div>}
        </> : <div className="stage-visual-preview"><div className="stage-visual-empty"><Image size={28}/><span>还没有当前帧的 {variant} Visual。点击“生成 Visual”开始。</span></div></div>}
      </div>
    </section>

    <section className="visual-stage-intent">
      <div><strong>Contract / Request Preview</strong><p>Visual 与 Stage 仍通过同一 Shot / Frame 契约绑定；远程 provider 收到的请求同时包含结构控制条件与这里的目标提示词。</p></div>
      <pre>{JSON.stringify(direction === 'stage-to-visual' && generationPreview ? generationPreview : intent, null, 2)}</pre>
      <div className="visual-stage-actions"><button onClick={() => downloadJson(stage.filename, stage)}><Download size={15}/>导出 Stage Artifact</button><button onClick={() => downloadJson(`${intent.id}.pds-link.json`, intent)}><Download size={15}/>导出 Link Intent</button>{generationPreview && <button onClick={() => downloadJson(`${shot.id}__stage-visual-request__f${String(stage.frame).padStart(6, '0')}.json`, generationPreview)}><Download size={15}/>导出 Generation Request</button>}</div>
    </section>
  </div>;
}
