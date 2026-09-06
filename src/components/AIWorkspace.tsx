import { useEffect, useMemo, useState } from 'react';
import type { AiModelProfile } from '../domain/ai';
import { analyzeFrameControls, controlBundleHash } from '../ai/controlAnalysis';
import { getAiGeneratedMedia } from '../storage/aiMediaStore';
import { approveAiOutput, generateAiMedia, promoteApprovedAiOutputToAsset, rejectAiOutput, runScriptBreakdown, upsertAiModelProfile } from '../store/aiRegistry';
import { useDirectorStore } from '../store/directorStore';
import { timeToFrame } from '../editorial/timelineEngine';

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
  const [prompt, setPrompt] = useState('Cinematic blocking reference, preserve actor positions, lens and screen direction.');
  const [negativePrompt, setNegativePrompt] = useState('Do not change cast count, camera side, blocking, or approved production facts.');
  const [runtimeToken, setRuntimeToken] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [modelId, setModelId] = useState('studio-model');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    Promise.all(project.ai.outputs.filter((output) => output.uri?.startsWith('pds://ai/') && output.mimeType?.startsWith('image/')).map(async (output) => {
      const stored = output.uri ? await getAiGeneratedMedia(output.uri) : undefined;
      if (!stored) return undefined;
      const blobBytes = new Uint8Array(stored.bytes.byteLength);
      blobBytes.set(stored.bytes);
      const url = URL.createObjectURL(new Blob([blobBytes.buffer], { type: stored.contentType ?? output.mimeType }));
      created.push(url);
      return [output.id, url] as const;
    })).then((entries) => { if (!cancelled) setPreviewUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>)); });
    return () => { cancelled = true; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [project.ai.outputs]);

  const selectedProfile = project.ai.profiles.find((profile) => profile.id === profileId);
  const doBreakdown = () => {
    try { const scenes = runScriptBreakdown(script); setMessage(`已生成 ${scenes.length} 个结构化 Scene Candidate。`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Script breakdown failed.'); }
  };
  const doGenerate = async () => {
    if (!selectedProfile) return;
    setBusy(true); setMessage('');
    try {
      const record = await generateAiMedia({ profileId: selectedProfile.id, task, prompt, negativePrompt, runtimeToken });
      setMessage(`${record.task} 已生成：${record.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'AI generation failed.'); }
    finally { setBusy(false); }
  };
  const addRemoteProfile = () => {
    try {
      const profile: AiModelProfile = {
        id: `remote-${modelId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'}`,
        label: `Studio · ${modelId}`,
        provider: 'pds-http', endpoint: endpoint.trim(), modelId: modelId.trim() || 'studio-model', revision: '1', tasks: ['storyboard', 'video'], defaultParameters: {}, enabled: true,
      };
      upsertAiModelProfile(profile); setProfileId(profile.id); setMessage(`已注册 ${profile.id}；Token 仍仅保存在当前 UI 内存。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Profile registration failed.'); }
  };

  return <div className="ai-workspace">
    <header className="ai-head"><div><strong>AI PRODUCTION</strong><span>Structure-conditioned · traceable · approval-gated</span></div><div className="ai-hash">SHOT {shot.id} v{shot.version} · F{frame} · CONTROL {controlHash.slice(0, 12)}</div></header>
    <div className="ai-columns">
      <section className="ai-panel"><h3>1 · SCRIPT BREAKDOWN</h3><textarea rows={8} value={script} onChange={(event) => setScript(event.target.value)} placeholder="Paste screenplay or use active Shot script…"/><button onClick={doBreakdown}>生成结构化 Scene Candidates</button><div className="ai-list">{project.ai.sceneCandidates.map((scene) => <article key={scene.id}><b>{scene.ordinal}. {scene.heading}</b><span>{scene.interiorExterior} · {scene.location} · {scene.timeOfDay}</span><small>Characters: {scene.characters.join(', ') || '—'} · Beats {scene.beats.length} · Props {scene.props.join(', ') || '—'} · Suggested shots {scene.recommendedShotCount}</small></article>)}</div></section>
      <section className="ai-panel"><h3>2 · STRUCTURE ANALYSIS</h3><div className="ai-metrics"><span>Camera {controls.cameraReference.focalLengthMm.toFixed(0)}mm</span><span>FOV {controls.cameraReference.verticalFovDeg.toFixed(1)}°</span><span>Actors {controls.pose.length}</span><span>Lights {controls.lights.length}</span></div><div className="ai-list">{controls.pose.map((actor) => { const depth = controls.depth.find((item) => item.actorId === actor.actorId); const line = controls.lineart.find((item) => item.actorId === actor.actorId); return <article key={actor.actorId}><b>{actor.name}</b><span>{actor.pose} · {actor.action}</span><small>Depth {depth?.cameraDepthM.toFixed(2)}m / {depth?.normalized.toFixed(2)} · Screen {line?.center.x.toFixed(3)}, {line?.center.y.toFixed(3)}</small></article>; })}</div><small className="ai-note">Pose / Depth / Lineart / Camera-reference come from the same frame-authoritative Shot state used by Editorial.</small></section>
      <section className="ai-panel"><h3>3 · MODEL PROFILE / GENERATION</h3><select value={profileId} onChange={(event) => setProfileId(event.target.value)}>{project.ai.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.modelId}@{profile.revision}</option>)}</select><div className="ai-row"><select value={task} onChange={(event) => setTask(event.target.value as 'storyboard' | 'video')}><option value="storyboard">Storyboard</option><option value="video">Video</option></select><input placeholder="Runtime bearer token (never persisted)" type="password" value={runtimeToken} onChange={(event) => setRuntimeToken(event.target.value)}/></div><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Prompt"/><textarea rows={3} value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="Negative prompt"/><button disabled={busy || !selectedProfile?.tasks.includes(task)} onClick={() => void doGenerate()}>{busy ? '生成中…' : `生成 ${task}`}</button><hr/><b>ADD PDS-HTTP PROFILE</b><input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://studio-ai.example/v1/generate"/><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="model id"/><button onClick={addRemoteProfile}>注册远程 Profile</button><small className="ai-note">Remote endpoint receives the PDS generation envelope. API Token exists only in component memory and is excluded from Project JSON/Profile snapshots.</small></section>
    </div>
    {message && <div className="ai-message">{message}</div>}
    <section className="ai-panel ai-output-panel"><h3>4 · GENERATED MEDIA / APPROVAL</h3><div className="ai-output-grid">{project.ai.outputs.map((output) => <article className="ai-output" key={output.id}>{previewUrls[output.id] && <img src={previewUrls[output.id]} alt={output.id}/>} {!previewUrls[output.id] && output.uri?.startsWith('http') && output.task === 'video' && <video src={output.uri} controls/>}<b>{output.task.toUpperCase()} · {output.status}</b><span>{output.profile.modelId}@{output.profile.revision} · Shot {output.sourceShotId} v{output.sourceShotVersion}{output.sourceFrame !== undefined ? ` · F${output.sourceFrame}` : ''}</span><small>Prompt {output.promptHashSha256.slice(0, 12)} · Control {output.controlHashSha256.slice(0, 12)} · Shot {output.sourceShotHashSha256.slice(0, 12)}</small>{output.error && <small className="ai-note">Error: {output.error}</small>}<div className="ai-row">{output.status === 'generated' && <><button onClick={() => approveAiOutput(output.id)}>Approve</button><button onClick={() => rejectAiOutput(output.id)}>Reject</button></>}{output.status === 'approved' && <button onClick={() => { try { promoteApprovedAiOutputToAsset(output.id); setMessage(`${output.id} 已注册为可追溯 Asset。`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Asset promotion failed.'); } }}>Promote to Asset Registry</button>}</div></article>)}</div>{project.ai.outputs.length === 0 && <small className="ai-note">No generated media yet. AI output is always additive; it never overwrites an Approved Shot.</small>}</section>
  </div>;
}
