import { useState } from 'react';
import { lightingPresets, type LightingPresetId } from '../domain/presets';
import { actorPresetList, type ActorPresetId } from '../domain/actorLibrary';
import { posePresetList, type PosePresetId } from '../domain/poseLibrary';
import { motionPresetList, type MotionPresetId } from '../domain/actorMotions';
import { lensPresetList } from '../domain/lensPresets';
import { useDirectorStore } from '../store/directorStore';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import type { Transform, Vec3 } from '../domain/model';
import { AssetLibraryPanel } from './AssetLibraryPanel';

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
  const selectObject = useDirectorStore((s) => s.selectObject);
  const editTransform = useDirectorStore((s) => s.updateActorTransformAxis);
  const applyPose = useDirectorStore((s) => s.applyActorPose);
  const applyMotion = useDirectorStore((s) => s.applyActorMotionPreset);
  const cam = useDirectorStore((s) => s.updateCamera);
  const camVec = useDirectorStore((s) => s.updateCameraVector);
  const applyLighting = useDirectorStore((s) => s.applyLightingPreset);
  const updateLight = useDirectorStore((s) => s.updateLight);
  const updateLightVector = useDirectorStore((s) => s.updateLightVector);
  const setLightShadow = useDirectorStore((s) => s.setLightCastShadow);
  const setExposure = useDirectorStore((s) => s.setExposureEv);
  const status = useDirectorStore((s) => s.setShotStatus);
  const saveVersion = useDirectorStore((s) => s.saveVersion);
  const addActor = useDirectorStore((s) => s.addActorPreset);
  const [preset, setPreset] = useState<ActorPresetId>('man-adult');
  const [motion, setMotion] = useState<MotionPresetId>('walk-forward');
  const actor = shot.actors.find((a) => a.id === selected);
  const selectedLight = shot.lights.find((light) => light.id === selected);
  const lightAtTime = selectedLight ? sampleLight(selectedLight, playhead) : undefined;
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
      <div className="meta">基础覆盖：男/女 × 儿童/青少年/成年/老年。角色尺寸保持真实米制比例。</div>
    </section>
    {actor && actorTransform && <section>
      <div className="section-title">BLOCKING · {actor.name}</div>
      {axes.map((axis) => <NumberField key={`p-${axis}`} label={`Position ${axis.toUpperCase()} (m)`} value={actorTransform.position[axis]} onChange={(v) => edit('position', axis, v)} />)}
      {axes.map((axis) => <NumberField key={`r-${axis}`} label={`Rotation ${axis.toUpperCase()} (°)`} value={radToDeg(actorTransform.rotation[axis])} step={1} onChange={(v) => edit('rotation', axis, degToRad(v))} />)}
      {axes.map((axis) => <NumberField key={`s-${axis}`} label={`Scale ${axis.toUpperCase()}`} value={actorTransform.scale[axis]} step={0.05} onChange={(v) => edit('scale', axis, v)} />)}
      <div className="section-title">POSE</div>
      <select value={actor.pose} onChange={(e) => applyPose(actor.id, e.target.value as PosePresetId)}>{posePresetList.map((pose) => <option key={pose.id} value={pose.id}>{pose.label} · {pose.action}</option>)}</select>
      <div className="section-title">MOTION PATH</div>
      <select value={motion} onChange={(e) => setMotion(e.target.value as MotionPresetId)}>{motionPresetList.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.distanceM.toFixed(1)}m</option>)}</select>
      <button className="wide" onClick={() => applyMotion(actor.id, motion)}>生成整 Shot 运动路径</button>
      <div className="meta">{actor.demographics.sex === 'male' ? '男' : '女'} · {actor.demographics.ageGroup} · {actor.demographics.ageYears}岁 · {actor.demographics.heightM.toFixed(2)}m<br />Pose: {actor.pose}<br />Action: {actor.action}<br />Keys: {actor.path.length} · Eye: {actor.eyeHeight}m</div>
    </section>}
    {selectedLight && lightAtTime && <section>
      <div className="section-title">LIGHT · {selectedLight.name}</div>
      <NumberField label="Intensity" value={lightAtTime.intensity} step={0.1} onChange={(v) => updateLight(selectedLight.id, 'intensity', v)} />
      <NumberField label="Color temp (K)" value={lightAtTime.colorTemperatureK} step={100} onChange={(v) => updateLight(selectedLight.id, 'colorTemperatureK', v)} />
      {lightAtTime.type !== 'ambient' && axes.map((axis) => <NumberField key={`lp-${axis}`} label={`Position ${axis.toUpperCase()} (m)`} value={lightAtTime.position[axis]} onChange={(v) => updateLightVector(selectedLight.id, 'position', axis, v)} />)}
      {lightAtTime.type !== 'ambient' && axes.map((axis) => <NumberField key={`lt-${axis}`} label={`Target ${axis.toUpperCase()} (m)`} value={(lightAtTime.target ?? { x: 0, y: 1.2, z: 0 })[axis]} onChange={(v) => updateLightVector(selectedLight.id, 'target', axis, v)} />)}
      <label className="toggle-field"><span>Cast shadow</span><input type="checkbox" checked={selectedLight.castShadow} onChange={(e) => setLightShadow(selectedLight.id, e.target.checked)} /></label>
      <div className="meta">Type: {selectedLight.type} · Keys: {selectedLight.path.length} · 有 Key Track 时数值/Gizmo 编辑自动写当前整帧。</div>
    </section>}
    <section>
      <div className="section-title">CAMERA · {shot.camera.path.length} KEYS</div>
      <NumberField label="Focal length (mm)" value={camera.focalLengthMm} step={1} onChange={(v) => cam('focalLengthMm', v)} />
      <select value="" onChange={(e) => { if (e.target.value) cam('focalLengthMm', Number(e.target.value)); }}>
        <option value="">焦段 Preset…</option>
        {lensPresetList.map((lens) => <option key={lens.id} value={lens.focalLengthMm}>{lens.label} · {lens.use}</option>)}
      </select>
      <NumberField label="Aperture" value={camera.aperture} step={0.1} onChange={(v) => cam('aperture', v)} />
      {axes.map((axis) => <NumberField key={`cp-${axis}`} label={`Camera ${axis.toUpperCase()} (m)`} value={camera.position[axis]} onChange={(v) => camVec('position', axis, v)} />)}
      {axes.map((axis) => <NumberField key={`ct-${axis}`} label={`Target ${axis.toUpperCase()} (m)`} value={camera.target[axis]} onChange={(v) => camVec('target', axis, v)} />)}
    </section>
    <section>
      <div className="section-title">LIGHTING / EXPOSURE</div>
      <NumberField label="Exposure compensation (EV)" value={shot.exposureEv} step={0.1} onChange={setExposure} />
      <select onChange={(e) => applyLighting(e.target.value as LightingPresetId)} defaultValue="neutral">{Object.entries(lightingPresets).map(([id, p]) => <option value={id} key={id}>{p.label}</option>)}</select>
      <div className="light-list">{shot.lights.map((light) => <button key={light.id} className={light.id === selected ? 'active' : ''} onClick={() => selectObject(light.id)}>{light.name}<span>{light.type} · {light.path.length}K</span></button>)}</div>
      <div className="meta">ACES Filmic 预览 · 曝光补偿范围 -8EV ～ +8EV。</div>
    </section>
    <AssetLibraryPanel />
  </aside>;
}
