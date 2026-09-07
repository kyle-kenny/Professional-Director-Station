import { useState } from 'react';
import { lightingPresets, type LightingPresetId } from '../domain/presets';
import { actorPresetList, type ActorPresetId } from '../domain/actorLibrary';
import { posePresetList, type PosePresetId } from '../domain/poseLibrary';
import { motionPresetList, type MotionPresetId } from '../domain/actorMotions';
import { lensPresetList } from '../domain/lensPresets';
import { useDirectorStore } from '../store/directorStore';
import { frameAspectPresets, setActiveShotFrameAspect, setActiveShotSensorWidthMm } from '../store/frameRegistry';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import type { DirectorLight, Transform, Vec3 } from '../domain/model';

function NumberField({ label, value, onChange, step = 0.1, disabled = false }: { label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean }) {
  return <label className="number-field"><span>{label}</span><input disabled={disabled} type="number" value={Number(value.toFixed(3))} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

const axes: (keyof Vec3)[] = ['x', 'y', 'z'];
const radToDeg = (value: number) => value * 180 / Math.PI;
const degToRad = (value: number) => value * Math.PI / 180;
const shadowSupported = (light: DirectorLight) => light.type === 'directional' || light.type === 'point' || light.type === 'spot';
const intensityLabel = (light: DirectorLight) => light.type === 'point' || light.type === 'spot' ? 'Intensity (cd)' : light.type === 'area' ? 'Intensity (nit)' : 'Intensity (relative)';

export function Inspector() {
  const shot = useDirectorStore((s) => s.getActiveShot());
  const playhead = useDirectorStore((s) => s.playhead);
  const selected = useDirectorStore((s) => s.selectedObjectId);
  const selectObject = useDirectorStore((s) => s.selectObject);
  const setMode = useDirectorStore((s) => s.setMode);
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
  const addActor = useDirectorStore((s) => s.addActorPreset);
  const [preset, setPreset] = useState<ActorPresetId>('man-adult');
  const [motion, setMotion] = useState<MotionPresetId>('walk-forward');
  const actor = shot.actors.find((a) => a.id === selected);
  const selectedLight = shot.lights.find((light) => light.id === selected);
  const lightAtTime = selectedLight ? sampleLight(selectedLight, playhead) : undefined;
  const actorTransform = actor ? sampleActorTransform(actor, playhead) : undefined;
  const camera = sampleCamera(shot.camera, playhead);
  const editable = shot.status !== 'APPROVED';

  const edit = (field: keyof Transform, axis: keyof Vec3, value: number) => editTransform(actor!.id, field, axis, value);

  return <aside className="inspector">
    <section>
      <div className="section-title">SHOT</div>
      <strong>{shot.name}</strong>
      <div className="meta">T {playhead.toFixed(2)}s · frame {Math.round(playhead * shot.fps)} / {Math.round(shot.duration * shot.fps)}<br />Status: {shot.status} · v{shot.version} · Aspect {shot.frameAspect.toFixed(3)}:1</div>
      {!editable && <div className="asset-message ok">APPROVED Shot 为只读。需要修改时请在 Review 中重新打开为新的 WIP。</div>}
      <NumberField label="Frame aspect" value={shot.frameAspect} step={0.01} disabled={!editable} onChange={setActiveShotFrameAspect} />
      <select disabled={!editable} value="" onChange={(e) => { if (e.target.value) setActiveShotFrameAspect(Number(e.target.value)); }}><option value="">画幅 Preset…</option>{frameAspectPresets.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}</select>
      <button className="wide" onClick={() => setMode('review')}>进入协作 / Review / Approval</button>
      <div className="meta">3D 镜头视图、2D 构图、AI Control、USD 与 MP4 共用同一 Shot 画幅；窗口尺寸只影响显示，不改变构图。</div>
    </section>
    <section>
      <div className="section-title">STANDARD CAST · 标准演员库</div>
      <select disabled={!editable} value={preset} onChange={(e) => setPreset(e.target.value as ActorPresetId)}>{actorPresetList.map((p) => <option value={p.id} key={p.id}>{p.label} · {p.heightM.toFixed(2)}m</option>)}</select>
      <button disabled={!editable} className="wide" onClick={() => addActor(preset)}>加入当前 Shot</button>
      <div className="meta">基础覆盖：男/女 × 儿童/青少年/成年/老年。角色尺寸保持真实米制比例。</div>
    </section>
    {actor && actorTransform && <section>
      <div className="section-title">BLOCKING · {actor.name}</div>
      {axes.map((axis) => <NumberField disabled={!editable} key={`p-${axis}`} label={`Position ${axis.toUpperCase()} (m)`} value={actorTransform.position[axis]} onChange={(v) => edit('position', axis, v)} />)}
      {axes.map((axis) => <NumberField disabled={!editable} key={`r-${axis}`} label={`Rotation ${axis.toUpperCase()} (°)`} value={radToDeg(actorTransform.rotation[axis])} step={1} onChange={(v) => edit('rotation', axis, degToRad(v))} />)}
      {axes.map((axis) => <NumberField disabled={!editable} key={`s-${axis}`} label={`Scale ${axis.toUpperCase()}`} value={actorTransform.scale[axis]} step={0.05} onChange={(v) => edit('scale', axis, v)} />)}
      <div className="section-title">POSE</div>
      <select disabled={!editable} value={actor.pose} onChange={(e) => applyPose(actor.id, e.target.value as PosePresetId)}>{posePresetList.map((pose) => <option key={pose.id} value={pose.id}>{pose.label} · {pose.action}</option>)}</select>
      <div className="section-title">MOTION PATH</div>
      <select disabled={!editable} value={motion} onChange={(e) => setMotion(e.target.value as MotionPresetId)}>{motionPresetList.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.distanceM.toFixed(1)}m</option>)}</select>
      <button disabled={!editable} className="wide" onClick={() => applyMotion(actor.id, motion)}>生成整 Shot 运动路径</button>
      <div className="meta">{actor.demographics.sex === 'male' ? '男' : '女'} · {actor.demographics.ageGroup} · {actor.demographics.ageYears}岁 · {actor.demographics.heightM.toFixed(2)}m<br />Pose: {actor.pose}<br />Action: {actor.action}<br />Keys: {actor.path.length} · Eye: {actor.eyeHeight}m</div>
    </section>}
    {selectedLight && lightAtTime && <section>
      <div className="section-title">LIGHT · {selectedLight.name}</div>
      <NumberField disabled={!editable} label={intensityLabel(lightAtTime)} value={lightAtTime.intensity} step={0.1} onChange={(v) => updateLight(selectedLight.id, 'intensity', v)} />
      <NumberField disabled={!editable} label="Color temp (K)" value={lightAtTime.colorTemperatureK} step={100} onChange={(v) => updateLight(selectedLight.id, 'colorTemperatureK', v)} />
      {lightAtTime.type !== 'ambient' && axes.map((axis) => <NumberField disabled={!editable} key={`lp-${axis}`} label={`Position ${axis.toUpperCase()} (m)`} value={lightAtTime.position[axis]} onChange={(v) => updateLightVector(selectedLight.id, 'position', axis, v)} />)}
      {lightAtTime.type !== 'ambient' && axes.map((axis) => <NumberField disabled={!editable} key={`lt-${axis}`} label={`Target ${axis.toUpperCase()} (m)`} value={(lightAtTime.target ?? { x: 0, y: 1.2, z: 0 })[axis]} onChange={(v) => updateLightVector(selectedLight.id, 'target', axis, v)} />)}
      <label className="toggle-field"><span>Cast shadow</span><input type="checkbox" disabled={!editable || !shadowSupported(lightAtTime)} checked={shadowSupported(lightAtTime) && selectedLight.castShadow} onChange={(e) => setLightShadow(selectedLight.id, e.target.checked)} /></label>
      <div className="meta">Type: {selectedLight.type} · Keys: {selectedLight.path.length} · {shadowSupported(lightAtTime) ? '该灯型支持实时阴影。' : '该灯型在当前 Three.js WebGL 路径不支持实时阴影。'} 有 Key Track 时数值/Gizmo 编辑自动写当前整帧。</div>
    </section>}
    <section>
      <div className="section-title">CAMERA · {shot.camera.path.length} KEYS</div>
      <NumberField disabled={!editable} label="Focal length (mm)" value={camera.focalLengthMm} step={1} onChange={(v) => cam('focalLengthMm', v)} />
      <NumberField disabled={!editable} label="Sensor width (mm)" value={camera.sensorWidthMm} step={0.1} onChange={setActiveShotSensorWidthMm} />
      <select disabled={!editable} value="" onChange={(e) => { if (e.target.value) cam('focalLengthMm', Number(e.target.value)); }}><option value="">焦段 Preset…</option>{lensPresetList.map((lens) => <option key={lens.id} value={lens.focalLengthMm}>{lens.label} · {lens.use}</option>)}</select>
      <NumberField disabled={!editable} label="Aperture (f-stop metadata)" value={camera.aperture} step={0.1} onChange={(v) => cam('aperture', v)} />
      <NumberField disabled={!editable} label="Focus distance (m)" value={camera.focusDistanceM} step={0.1} onChange={(v) => cam('focusDistanceM', v)} />
      {axes.map((axis) => <NumberField disabled={!editable} key={`cp-${axis}`} label={`Camera ${axis.toUpperCase()} (m)`} value={camera.position[axis]} onChange={(v) => camVec('position', axis, v)} />)}
      {axes.map((axis) => <NumberField disabled={!editable} key={`ct-${axis}`} label={`Target ${axis.toUpperCase()} (m)`} value={camera.target[axis]} onChange={(v) => camVec('target', axis, v)} />)}
      <div className="meta">Previs 视口使用真实 filmback/focal 几何；f-stop / focus distance 作为镜头元数据保留，当前灰盒 WebGL 预览不模拟景深。</div>
    </section>
    <section>
      <div className="section-title">LIGHTING / EXPOSURE</div>
      <NumberField disabled={!editable} label="Exposure compensation (EV)" value={shot.exposureEv} step={0.1} onChange={setExposure} />
      <select disabled={!editable} onChange={(e) => applyLighting(e.target.value as LightingPresetId)} defaultValue="neutral">{Object.entries(lightingPresets).map(([id, p]) => <option value={id} key={id}>{p.label}</option>)}</select>
      <div className="light-list">{shot.lights.map((light) => <button key={light.id} className={light.id === selected ? 'active' : ''} onClick={() => selectObject(light.id)}>{light.name}<span>{light.type} · {light.path.length}K</span></button>)}</div>
      <div className="meta">ACES Filmic 预览 · 曝光补偿范围 -8EV ～ +8EV。Point/Spot 使用 cd；Area 使用亮度量级；Directional/Ambient 为预览相对强度。</div>
    </section>
  </aside>;
}
