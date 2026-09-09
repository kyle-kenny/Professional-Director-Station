import { useEffect, useMemo, useState } from 'react';
import type { AiModelProfile } from '../domain/ai';
import { posePresetList } from '../domain/poseLibrary';
import { analyzeFrameControls, controlBundleHash } from '../ai/controlAnalysis';
import { getAiGeneratedMedia } from '../storage/aiMediaStore';
import { approveAiOutput, generateAiMedia, promoteApprovedAiOutputToAsset, rejectAiOutput, runScriptBreakdown, upsertAiModelProfile } from '../store/aiRegistry';
import { useDirectorStore } from '../store/directorStore';
import { timeToFrame } from '../editorial/timelineEngine';

const outputStatusZh: Record<string, string> = { generated: '已生成', approved: '已批准', rejected: '已拒绝', failed: '失败' };
const taskZh = { storyboard: '故事板', video: '视频' } as const;
const interiorExteriorZh: Record<string, string> = { INT: '内景', EXT: '外景', MIXED: '内外景', UNKNOWN: '未指定' };
const actionZh: Record<string, string> = { idle: '静止', dialogue: '对话', hold: '保持', point: '指向', guard: '警戒', crouch: '蹲伏', sit: '坐姿', walk: '行走', 'walk-forward': '向前行走', retreat: '后退', 'cross-left': '向左横穿', 'cross-right': '向右横穿', 'pose-edit': '调姿编辑' };
const poseLabel = (id: string) => id.startsWith('custom:') ? '自定义姿势' : posePresetList.find((pose) => pose.id === id)?.label ?? '自定义姿势';
const normalizeSceneMeta = (value: string) => value === 'UNKNOWN' || value === 'UNSPECIFIED' ? '未指定' : value;

export function AIWorkspace() {
  const project = useDirectorStore((state) => state.project);
  const shot = useDirectorStore((state) => state.getActiveShot());
  const playhead = useDirectorStore((state) => state.playhead);
  const frame = timeToFrame(playhead, shot.fps);
  const controls = useMemo(() => analyzeFrameControls(shot, frame), [shot, frame]);
  const controlHash = useMemo(() => controlBundleHash(controls), [controls]);
  const [script, setScript] = useState(shot.script);
  const [profileId, setProfileId] = useState(project.ai.profiles[0]?.id ?? 'local-structural-v1');
  const [task, setTask] = useState<'storyboard' | 'video'>('storyboard');
  const [prompt, setPrompt] = useState('电影化调度参考；保持人物站位、镜头焦段和轴线方向。');
  const [negativePrompt, setNegativePrompt] = useState('不要改变演员数量、摄影机轴线、场面调度或已经批准的制作事实。');
  const [runtimeToken, setRuntimeToken] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [modelId, setModelId] = useState('studio-model');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false; const created: string[] = [];
    Promise.all(project.ai.outputs.filter((output) => output.uri?.startsWith('pds://ai/') && output.mimeType?.startsWith('image/')).map(async (output) => {
      const stored = output.uri ? await getAiGeneratedMedia(output.uri) : undefined; if (!stored) return undefined;
      const blobBytes = new Uint8Array(stored.bytes.byteLength); blobBytes.set(stored.bytes);
      const url = URL.createObjectURL(new Blob([blobBytes.buffer], { type: stored.contentType ?? output.mimeType })); created.push(url); return [output.id, url] as const;
    })).then((entries) => { if (!cancelled) setPreviewUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>)); });
    return () => { cancelled = true; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [project.ai.outputs]);

  const selectedProfile = project.ai.profiles.find((profile) => profile.id === profileId);
  const doBreakdown = () => {
    try { const scenes = runScriptBreakdown(script); setMessage(`已生成 ${scenes.length} 个结构化场景候选。`); }
    catch (error) { setMessage(error instanceof Error ? error.message : '剧本拆解失败。'); }
  };
  const doGenerate = async () => {
    if (!selectedProfile) return; setBusy(true); setMessage('');
    try { const record = await generateAiMedia({ profileId: selectedProfile.id, task, prompt, negativePrompt, runtimeToken }); setMessage(`${taskZh[record.task]}已生成：${record.id}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'AI 生成失败。'); }
    finally { setBusy(false); }
  };
  const addRemoteProfile = () => {
    try {
      const profile: AiModelProfile = { id: `remote-${modelId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'}`, label: `工作室 · ${modelId}`, provider: 'pds-http', endpoint: endpoint.trim(), modelId: modelId.trim() || 'studio-model', revision: '1', tasks: ['storyboard', 'video'], defaultParameters: {}, enabled: true };
      upsertAiModelProfile(profile); setProfileId(profile.id); setMessage(`已注册 ${profile.id}；令牌仍只保存在当前界面内存，不写入工程。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '模型配置注册失败。'); }
  };

  return <div className="ai-workspace">
    <header className="ai-head"><div><strong>AI 制作</strong><span>结构条件控制 · 全程可追溯 · 审批后使用</span></div><div className="ai-hash">镜头 {shot.id} v{shot.version} · 第 {frame} 帧 · 控制哈希 {controlHash.slice(0, 12)}</div></header>
    <div className="ai-columns">
      <section className="ai-panel"><h3>1 · 剧本拆解</h3><textarea rows={8} value={script} onChange={(event) => setScript(event.target.value)} placeholder="粘贴剧本，或使用当前镜头剧本…"/><button onClick={doBreakdown}>生成结构化场景候选</button><div className="ai-list">{project.ai.sceneCandidates.map((scene) => <article key={scene.id}><b>{scene.ordinal}. {scene.heading}</b><span>{interiorExteriorZh[scene.interiorExterior] ?? scene.interiorExterior} · {normalizeSceneMeta(scene.location)} · {normalizeSceneMeta(scene.timeOfDay)}</span><small>人物：{scene.characters.join('、') || '—'} · 节拍 {scene.beats.length} · 道具：{scene.props.join('、') || '—'} · 建议镜头数 {scene.recommendedShotCount}</small></article>)}</div></section>
      <section className="ai-panel"><h3>2 · 结构分析</h3><div className="ai-metrics"><span>摄影机 {controls.cameraReference.focalLengthMm.toFixed(0)} 毫米</span><span>视场角 {controls.cameraReference.verticalFovDeg.toFixed(1)}°</span><span>人物 {controls.pose.length}</span><span>灯光 {controls.lights.length}</span></div><div className="ai-list">{controls.pose.map((actor) => { const depth = controls.depth.find((item) => item.actorId === actor.actorId); const line = controls.lineart.find((item) => item.actorId === actor.actorId); return <article key={actor.actorId}><b>{actor.name}</b><span>{poseLabel(actor.pose)} · {actionZh[actor.action] ?? '自定义动作'} · 骨骼 {actor.rigHashSha256.slice(0, 10)}</span><small>摄影机深度 {depth?.cameraDepthM.toFixed(2)} 米 / 归一化 {depth?.normalized.toFixed(2)} · 画面坐标 {line?.center.x.toFixed(3)}, {line?.center.y.toFixed(3)}</small></article>; })}</div><small className="ai-note">姿势 / Humanoid Rig / 深度 / 线稿 / 摄影机参考全部来自与剪辑系统相同的帧权威镜头状态。</small></section>
      <section className="ai-panel"><h3>3 · 模型配置 / 生成</h3><select value={profileId} onChange={(event) => setProfileId(event.target.value)}>{project.ai.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.modelId}@{profile.revision}</option>)}</select><div className="ai-row"><select value={task} onChange={(event) => setTask(event.target.value as 'storyboard' | 'video')}><option value="storyboard">故事板</option><option value="video">视频</option></select><input placeholder="运行时访问令牌（绝不持久化）" type="password" value={runtimeToken} onChange={(event) => setRuntimeToken(event.target.value)}/></div><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="生成提示词"/><textarea rows={3} value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="负向提示词"/><button disabled={busy || !selectedProfile?.tasks.includes(task)} onClick={() => void doGenerate()}>{busy ? '生成中…' : `生成${taskZh[task]}`}</button><hr/><b>添加 PDS-HTTP 模型配置</b><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://studio-ai.example/v1/generate"/><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="模型 ID"/><button onClick={addRemoteProfile}>注册远程模型配置</button><small className="ai-note">远程端点接收 PDS 生成请求封装。API 令牌只存在于当前组件内存，不写入工程 JSON 或模型配置快照。</small></section>
    </div>
    {message && <div className="ai-message">{message}</div>}
    <section className="ai-panel ai-output-panel"><h3>4 · 生成媒体 / 审批</h3><div className="ai-output-grid">{project.ai.outputs.map((output) => <article className="ai-output" key={output.id}>{previewUrls[output.id] && <img src={previewUrls[output.id]} alt={output.id}/>} {!previewUrls[output.id] && output.uri?.startsWith('http') && output.task === 'video' && <video src={output.uri} controls/>}<b>{taskZh[output.task]} · {outputStatusZh[output.status] ?? output.status}</b><span>{output.profile.modelId}@{output.profile.revision} · 镜头 {output.sourceShotId} v{output.sourceShotVersion}{output.sourceFrame !== undefined ? ` · 第 ${output.sourceFrame} 帧` : ''}</span><small>提示词 {output.promptHashSha256.slice(0, 12)} · 控制 {output.controlHashSha256.slice(0, 12)} · 镜头 {output.sourceShotHashSha256.slice(0, 12)}</small>{output.error && <small className="ai-note">错误：{output.error}</small>}<div className="ai-row">{output.status === 'generated' && <><button onClick={() => approveAiOutput(output.id)}>批准</button><button onClick={() => rejectAiOutput(output.id)}>拒绝</button></>}{output.status === 'approved' && <button onClick={() => { try { promoteApprovedAiOutputToAsset(output.id); setMessage(`${output.id} 已作为可追溯资产注册。`); } catch (error) { setMessage(error instanceof Error ? error.message : '晋升到资产库失败。'); } }}>登记到资产库</button>}</div></article>)}</div>{project.ai.outputs.length === 0 && <small className="ai-note">尚无生成媒体。AI 输出始终以新增方式写入，绝不会覆盖已批准镜头。</small>}</section>
  </div>;
}
