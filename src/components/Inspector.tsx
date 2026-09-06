import { useState } from 'react';
import { lightingPresets, type LightingPresetId } from '../domain/presets';
import { actorPresetList, type ActorPresetId } from '../domain/actorLibrary';
import { useDirectorStore } from '../store/directorStore';
import { sampleActorTransform, sampleCamera } from '../utils/animation';
import type { Transform, Vec3 } from '../domain/model';

function NumberField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return <label className="number-field"><span>{label}</span><input type="number" value={Number(value.toFixed(3))} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

const axes: (keyof Vec3)[] = ['x', 'y', 'z'];
const radToDeg = (value: number) => value * 180 / Math.PI;
const degToRad = (value: number) => value * Math.PI / 180;

export function Inspector() {
  const shot = useDirectorStore((s) => s.getActiveShot());
  const playhead = useDirectorStore((s) => s.playhead);
  const selected = useDirectorStore((s) => s.selectedObjectId);
  const editTransform = useDirectorStore((s) => s.updateActorTransformAxis);
  const cam = useDirectorStore((s) => s.updateCamera);
  const camVec = useDirectorStore((s) => s.updateCameraVector);
  const apply = useDirectorStore((s) => s.applyLightingPreset);
  const status = useDirectorStore((s) => s.setShotStatus);
  const saveVersion = useDirectorStore((s) => s.saveVersion);
  const addActor = useDirectorStore((s) => s.addActorPreset);
  const [preset, setPreset] = useState<ActorPresetId>('man-adult');
  const actor = shot.actors.find((a) => a.id === selected);
  const actorTransform = actor ? sampleActorTransform(actor, playhead) : undefined;
  const camera = sampleCamera(shot.camera, playhead);

  const edit = (field: keyof Transform, axis: keyof Vec3, value: number) => editTransform(actor!.id, field, axis, value);

  return <aside className="inspector">
    <section>
      <div className="section-title">SHOT</div>
      <strong>{shot.name}</strong>
      <div className="meta">T {playhead.toFixed(2)}s · frame {Math.round(playhead * shot.fps)} / {Math.round(shot.duration * shot.fps)}</div>
      <div className="status-row">{(['WIP', 'REVIEW', 'APPROVED'] as const).map((v) => <button className={shot.status === v ? 'active' : ''} onClick={() => status(v)} key={v}>{v}</button>)}</div>
      <button className="wide" onClick={saveVersion}>保存版本 v{shot.version + 1}</button>
    </section>
    <section>
      <div className="section-title">STANDARD CAST · 标准演员库</div>
      <select value={preset} onChange={(e) => setPreset(e.target.value as ActorPresetId)}>{actorPresetList.map((p) => <option value={p.id} key={p.id}>{p.label} · {p.heightM.toFixed(2)}m</option>)}</select>
      <button className="wide" onClick={() => addActor(preset)}>加入当前 Shot</button>
      <div className="meta">基础覆盖：男/女 × 儿童/青少年/成年/老年。后续可替换为授权明确的写实角色资产。</div>
    </section>
    {actor && actorTransform && <section>
      <div className="section-title">BLOCKING · {actor.name}</div>
      {axes.map((axis) => <NumberField key={`p-${axis}`} label={`Position ${axis.toUpperCase()} (m)`} value={actorTransform.position[axis]} onChange={(v) => edit('position', axis, v)} />)}
      {axes.map((axis) => <NumberField key={`r-${axis}`} label={`Rotation ${axis.toUpperCase()} (°)`} value={radToDeg(actorTransform.rotation[axis])} step={1} onChange={(v) => edit('rotation', axis, degToRad(v))} />)}
      {axes.map((axis) => <NumberField key={`s-${axis}`} label={`Scale ${axis.toUpperCase()}`} value={actorTransform.scale[axis]} step={0.05} onChange={(v) => edit('scale', axis, v)} />)}
      <div className="meta">{actor.demographics.sex === 'male' ? '男' : '女'} · {actor.demographics.ageGroup} · {actor.demographics.ageYears}岁 · {actor.demographics.heightM.toFixed(2)}m<br />Pose: {actor.pose}<br />Action: {actor.action}<br />Keys: {actor.path.length} · Eye: {actor.eyeHeight}m</div>
    </section>}
    <section>
      <div className="section-title">CAMERA · {shot.camera.path.length} KEYS</div>
      <NumberField label="Focal length (mm)" value={camera.focalLengthMm} step={1} onChange={(v) => cam('focalLengthMm', v)} />
      <NumberField label="Aperture" value={camera.aperture} step={0.1} onChange={(v) => cam('aperture', v)} />
      {axes.map((axis) => <NumberField key={`cp-${axis}`} label={`Camera ${axis.toUpperCase()} (m)`} value={camera.position[axis]} onChange={(v) => camVec('position', axis, v)} />)}
      {axes.map((axis) => <NumberField key={`ct-${axis}`} label={`Target ${axis.toUpperCase()} (m)`} value={camera.target[axis]} onChange={(v) => camVec('target', axis, v)} />)}
    </section>
    <section>
      <div className="section-title">LIGHTING PRESET</div>
      <select onChange={(e) => apply(e.target.value as LightingPresetId)} defaultValue="neutral">{Object.entries(lightingPresets).map(([id, p]) => <option value={id} key={id}>{p.label}</option>)}</select>
      <div className="meta">当前灯具：{shot.lights.map((l) => l.name).join(' / ')}</div>
    </section>
  </aside>;
}
