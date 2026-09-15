import { ArrowLeftRight, Download, Image, Layers3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import {
  createStageArtifact,
  createVisualFixture,
  createVisualStageLinkIntent,
  VISUAL_STAGE_UI,
  type VisualFixtureVariant,
  type VisualStageDirection,
} from '../domain/visualStage';

const variants: Array<{ id: VisualFixtureVariant; label: string; note: string }> = [
  { id: 'composition', label: '构图', note: '画幅、主体位置与视觉重心占位' },
  { id: 'lighting', label: '灯光', note: '主补轮廓关系与明暗层次占位' },
  { id: 'look', label: 'Look', note: '综合色调、氛围与最终视觉方向占位' },
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

export function VisualStageWorkspace() {
  const project = useDirectorStore((state) => state.project);
  const sequenceId = useDirectorStore((state) => state.activeSequenceId);
  const shotId = useDirectorStore((state) => state.activeShotId);
  const playhead = useDirectorStore((state) => state.playhead);
  const [variant, setVariant] = useState<VisualFixtureVariant>('composition');
  const [direction, setDirection] = useState<VisualStageDirection>('visual-to-stage');

  const sequence = project.sequences.find((item) => item.id === sequenceId) ?? project.sequences[0];
  const shot = sequence.shots.find((item) => item.id === shotId) ?? sequence.shots[0];
  const frame = Math.max(0, Math.round(playhead * shot.fps));
  const stage = useMemo(() => createStageArtifact(project.id, sequence.id, shot, frame), [frame, project.id, sequence.id, shot]);
  const visual = useMemo(() => createVisualFixture(stage, variant), [stage, variant]);
  const intent = useMemo(() => createVisualStageLinkIntent(direction, visual, stage), [direction, stage, visual]);

  return <div className="visual-stage-workspace">
    <header className="visual-stage-header">
      <div><span className="chip">PDS 1.4 · Phase 1</span><h2>{VISUAL_STAGE_UI.workspace}</h2><p>建立 Visual deliverable 与现有 Stage Shot/frame 的稳定契约；本阶段不运行模型，也不自动修改舞台。</p></div>
      <div className="visual-stage-frame"><b>{shot.name}</b><span>Frame {stage.frame}</span><small>{shot.fps} fps · {shot.frameAspect.toFixed(3)}</small></div>
    </header>

    <div className="visual-stage-flow">
      <section className="visual-stage-card visual-side">
        <div className="visual-stage-card-title"><Image size={17}/><div><strong>{VISUAL_STAGE_UI.visual}</strong><span>Visual deliverable fixture</span></div></div>
        <div className="visual-variant-grid">{variants.map((item) => <button key={item.id} className={variant === item.id ? 'active' : ''} onClick={() => setVariant(item.id)}><b>{item.label}</b><span>{item.note}</span></button>)}</div>
        <div className="artifact-readout"><span>Fixture</span><code>{visual.filename}</code><small>{visual.schemaVersion} · {visual.source}</small></div>
      </section>

      <section className="visual-stage-bridge">
        <ArrowLeftRight size={24}/>
        <strong>{direction === 'visual-to-stage' ? VISUAL_STAGE_UI.visualToStage : VISUAL_STAGE_UI.stageToVisual}</strong>
        <div className="bridge-switch"><button className={direction === 'visual-to-stage' ? 'active' : ''} onClick={() => setDirection('visual-to-stage')}>Visual → Stage</button><button className={direction === 'stage-to-visual' ? 'active' : ''} onClick={() => setDirection('stage-to-visual')}>Stage → Visual</button></div>
        <span className="draft-badge">DRAFT INTENT</span>
      </section>

      <section className="visual-stage-card stage-side">
        <div className="visual-stage-card-title"><Layers3 size={17}/><div><strong>{VISUAL_STAGE_UI.stage}</strong><span>Current PDS Stage snapshot</span></div></div>
        <div className="stage-metrics"><div><b>{stage.actors.length}</b><span>Actors</span></div><div><b>{stage.lights.length}</b><span>Lights</span></div><div><b>{stage.camera.focalLengthMm.toFixed(0)} mm</b><span>Lens</span></div></div>
        <div className="artifact-readout"><span>Artifact</span><code>{stage.filename}</code><small>{stage.schemaVersion} · deterministic frame snapshot</small></div>
      </section>
    </div>

    <section className="visual-stage-intent">
      <div><strong>Link Intent Preview</strong><p>只记录同一 Shot / Frame 的桥接意图。Phase 1 不把 Visual 结果写回 Stage，也不触发推理。</p></div>
      <pre>{JSON.stringify(intent, null, 2)}</pre>
      <div className="visual-stage-actions"><button onClick={() => downloadJson(stage.filename, stage)}><Download size={15}/>导出 Stage Artifact</button><button onClick={() => downloadJson(`${intent.id}.pds-link.json`, intent)}><Download size={15}/>导出 Link Intent</button></div>
    </section>
  </div>;
}
