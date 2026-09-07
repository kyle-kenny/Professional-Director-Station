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
import { PoseEditorPanel } from './PoseEditorPanel';
import { applyPresetPose } from '../store/poseRegistry';

function NumberField({ label, value, onChange, step = 0.1, disabled = false }: { label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean }) {
  return <label className="number-field"><span>{label}</span><input disabled={disabled} type="number" value={Number(value.toFixed(3))} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

const axes: (keyof Vec3)[] = ['x', 'y', 'z'];
const radToDeg = (value: number) => value * 180 / Math.PI;
const degToRad = (value: number) => value * Math.PI / 180;
const shadowSupported = (light: DirectorLight) => light.type === 'directional' || light.type === 'point' || light.type === 'spot';
const intensityLabel = (light: DirectorLight) => light.type === 'point' || light.type === 'spot' ? '强度（坎德拉 cd）' : light.type === 'area' ? '强度（尼特 nit）' : '强度（相对值）';
const ageGroupZh = { child: '儿童', teen: '青少年', adult: '成年', elderly: '老年' } as const;
const lightTypeZh = { directional: '平行光', point: '点光', spot: '聚光灯', area: '区域光', ambient: '环境光' } as const;
const actionZh: Record<string, string> = { idle: '静止', dialogue: '对话', hold: '保持', point: '指向', guard: '警戒', crouch: '蹲伏', sit: '坐姿', walk: '行走', 'walk-forward': '向前行走', retreat: '后退', 'cross-left': '向左横穿', 'cross-right': '向右横穿', 'pose-edit': '调姿编辑' };
const poseLabel = (id: string) => id.startsWith('custom:') ? '自定义姿势' : posePresetList.find((pose) => pose.id === id)?.label ?? '自定义姿势';

export function Inspector() {
  const shot = useDirectorStore((s) => s.getActiveShot());
  const playhead = useDirectorStore((s) => s.playhead);
  const selected = useDirectorStore((s) => s.selectedObjectId);
  const selectObject = useDirectorStore((s) => s.selectObject);
  const setMode = useDirectorStore((s) => s.setMode);
  const editTransform = useDirectorStore((s) => s.updateActorTransformAxis);
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
      <div className="section-title">镜头</div>
      <strong>{shot.name}</strong>
      <div className="meta">时间 {playhead.toFixed(2)} 秒 · 第 {Math.round(playhead * shot.fps)} / {Math.round(shot.duration * shot.fps)} 帧<br />状态：{shot.status === 'APPROVED' ? '已批准' : shot.status === 'REVIEW' ? '审片中' : '制作中'} · v{shot.version} · 画幅 {shot.frameAspect.toFixed(3)}:1</div>
      {!editable && <div className="asset-message ok">已批准镜头为只读。需要修改时请在审片工作区重新打开为新的制作中版本。</div>}
      <NumberField label="画幅比例" value={shot.frameAspect} step={0.01} disabled={!editable} onChange={setActiveShotFrameAspect} />
      <select disabled={!editable} value="" onChange={(e) => { if (e.target.value) setActiveShotFrameAspect(Number(e.target.value)); }}><option value="">画幅预设…</option>{frameAspectPresets.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}</select>
      <button className="wide" onClick={() => setMode('review')}>进入协作 / 审片 / 审批</button>
      <div className="meta">3D 镜头视图、2D 构图、AI 控制、USD 与 MP4 共用同一镜头画幅；窗口尺寸只影响显示，不改变构图。</div>
    </section>
    <section>
      <div className="section-title">标准演员库</div>
      <select disabled={!editable} value={preset} onChange={(e) => setPreset(e.target.value as ActorPresetId)}>{actorPresetList.map((p) => <option value={p.id} key={p.id}>{p.label} · {p.heightM.toFixed(2)} 米</option>)}</select>
      <button disabled={!editable} className="wide" onClick={() => addActor(preset)}>加入当前镜头</button>
      <div className="meta">正式开源 Humanoid 角色覆盖：男/女 × 儿童/青少年/成年/老年。人物保持真实米制身高，3D 使用 Quaternius CC0 SkinnedMesh。</div>
    </section>
    {actor && actorTransform && <>
      <section>
        <div className="section-title">场面调度 · {actor.name}</div>
        {axes.map((axis) => <NumberField disabled={!editable} key={`p-${axis}`} label={`位置 ${axis.toUpperCase()}（米）`} value={actorTransform.position[axis]} onChange={(v) => edit('position', axis, v)} />)}
        {axes.map((axis) => <NumberField disabled={!editable} key={`r-${axis}`} label={`整体旋转 ${axis.toUpperCase()}（°）`} value={radToDeg(actorTransform.rotation[axis])} step={1} onChange={(v) => edit('rotation', axis, degToRad(v))} />)}
        {axes.map((axis) => <NumberField disabled={!editable} key={`s-${axis}`} label={`整体缩放 ${axis.toUpperCase()}`} value={actorTransform.scale[axis]} step={0.05} onChange={(v) => edit('scale', axis, v)} />)}
        <div className="section-title">姿势预设</div>
        <select disabled={!editable} value={actor.pose.startsWith('custom:') ? '' : actor.pose} onChange={(e) => applyPresetPose(actor.id, e.target.value as PosePresetId)}><option value="" disabled>自定义姿势</option>{posePresetList.map((pose) => <option key={pose.id} value={pose.id}>{pose.label}</option>)}</select>
        <div className="section-title">运动路径</div>
        <select disabled={!editable} value={motion} onChange={(e) => setMotion(e.target.value as MotionPresetId)}>{motionPresetList.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.distanceM.toFixed(1)} 米</option>)}</select>
        <button disabled={!editable} className="wide" onClick={() => applyMotion(actor.id, motion)}>生成整镜头运动路径</button>
        <div className="meta">{actor.demographics.sex === 'male' ? '男' : '女'} · {ageGroupZh[actor.demographics.ageGroup]} · {actor.demographics.ageYears} 岁 · {actor.demographics.heightM.toFixed(2)} 米<br />姿势：{poseLabel(actor.pose)}<br />动作：{actionZh[actor.action] ?? '自定义动作'}<br />位移关键帧：{actor.path.length} · 姿势关键帧：{actor.posePath?.length ?? 0} · 眼高：{actor.eyeHeight} 米</div>
      </section>
      <section><PoseEditorPanel actor={actor} /></section>
    </>}
    {selectedLight && lightAtTime && <section>
      <div className="section-title">灯光 · {selectedLight.name}</div>
      <NumberField disabled={!editable} label={intensityLabel(lightAtTime)} value={lightAtTime.intensity} step={0.1} onChange={(v) => updateLight(selectedLight.id, 'intensity', v)} />
      <NumberField disabled={!editable} label="色温（K）" value={lightAtTime.colorTemperatureK} step={100} onChange={(v) => updateLight(selectedLight.id, 'colorTemperatureK', v)} />
      {lightAtTime.type !== 'ambient' && axes.map((axis) => <NumberField disabled={!editable} key={`lp-${axis}`} label={`位置 ${axis.toUpperCase()}（米）`} value={lightAtTime.position[axis]} onChange={(v) => updateLightVector(selectedLight.id, 'position', axis, v)} />)}
      {lightAtTime.type !== 'ambient' && axes.map((axis) => <NumberField disabled={!editable} key={`lt-${axis}`} label={`目标 ${axis.toUpperCase()}（米）`} value={(lightAtTime.target ?? { x: 0, y: 1.2, z: 0 })[axis]} onChange={(v) => updateLightVector(selectedLight.id, 'target', axis, v)} />)}
      <label className="toggle-field"><span>投射阴影</span><input type="checkbox" disabled={!editable || !shadowSupported(lightAtTime)} checked={shadowSupported(lightAtTime) && selectedLight.castShadow} onChange={(e) => setLightShadow(selectedLight.id, e.target.checked)} /></label>
      <div className="meta">类型：{lightTypeZh[selectedLight.type]} · 关键帧：{selectedLight.path.length} · {shadowSupported(lightAtTime) ? '该灯型支持实时阴影。' : '该灯型在当前 Three.js WebGL 路径不支持实时阴影。'} 有关键帧轨时，数值/操纵器编辑自动写当前整帧。</div>
    </section>}
    <section>
      <div className="section-title">摄影机 · {shot.camera.path.length} 个关键帧</div>
      <NumberField disabled={!editable} label="焦距（毫米）" value={camera.focalLengthMm} step={1} onChange={(v) => cam('focalLengthMm', v)} />
      <NumberField disabled={!editable} label="传感器宽度（毫米）" value={camera.sensorWidthMm} step={0.1} onChange={setActiveShotSensorWidthMm} />
      <select disabled={!editable} value="" onChange={(e) => { if (e.target.value) cam('focalLengthMm', Number(e.target.value)); }}><option value="">焦段预设…</option>{lensPresetList.map((lens) => <option key={lens.id} value={lens.focalLengthMm}>{lens.label} · {lens.use}</option>)}</select>
      <NumberField disabled={!editable} label="光圈（f-stop 元数据）" value={camera.aperture} step={0.1} onChange={(v) => cam('aperture', v)} />
      <NumberField disabled={!editable} label="对焦距离（米）" value={camera.focusDistanceM} step={0.1} onChange={(v) => cam('focusDistanceM', v)} />
      {axes.map((axis) => <NumberField disabled={!editable} key={`cp-${axis}`} label={`摄影机 ${axis.toUpperCase()}（米）`} value={camera.position[axis]} onChange={(v) => camVec('position', axis, v)} />)}
      {axes.map((axis) => <NumberField disabled={!editable} key={`ct-${axis}`} label={`目标 ${axis.toUpperCase()}（米）`} value={camera.target[axis]} onChange={(v) => camVec('target', axis, v)} />)}
      <div className="meta">预演视口使用真实 filmback / focal 几何；f-stop / 对焦距离作为镜头元数据保留，当前 WebGL 预演不模拟最终景深。</div>
    </section>
    <section>
      <div className="section-title">灯光 / 曝光</div>
      <NumberField disabled={!editable} label="曝光补偿（EV）" value={shot.exposureEv} step={0.1} onChange={setExposure} />
      <select disabled={!editable} onChange={(e) => applyLighting(e.target.value as LightingPresetId)} defaultValue="neutral">{Object.entries(lightingPresets).map(([id, p]) => <option value={id} key={id}>{p.label}</option>)}</select>
      <div className="light-list">{shot.lights.map((light) => <button key={light.id} className={light.id === selected ? 'active' : ''} onClick={() => selectObject(light.id)}>{light.name}<span>{lightTypeZh[light.type]} · {light.path.length} 个关键帧</span></button>)}</div>
      <div className="meta">ACES Filmic 预览 · 曝光补偿范围 -8EV ～ +8EV。点光/聚光灯使用 cd；区域光使用亮度量级；平行光/环境光为预览相对强度。</div>
    </section>
  </aside>;
}
