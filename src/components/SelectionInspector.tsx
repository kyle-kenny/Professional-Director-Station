import { Inspector } from './Inspector';
import { PoseEditorPanel } from './PoseEditorPanel';
import { posePresetList, type PosePresetId } from '../domain/poseLibrary';
import { lensPresetList } from '../domain/lensPresets';
import type { DirectorLight, Transform, Vec3 } from '../domain/model';
import { useDirectorStore } from '../store/directorStore';
import { setActiveShotSensorWidthMm } from '../store/frameRegistry';
import { applyPresetPose } from '../store/poseRegistry';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import '../selection-inspector.css';

function NumberField({ label, value, onChange, step = 0.1, disabled = false }: { label: string; value: number; onChange: (value: number) => void; step?: number; disabled?: boolean }) {
  return <label className="number-field"><span>{label}</span><input disabled={disabled} type="number" value={Number(value.toFixed(3))} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

const axes: (keyof Vec3)[] = ['x', 'y', 'z'];
const radToDeg = (value: number) => value * 180 / Math.PI;
const degToRad = (value: number) => value * Math.PI / 180;
const shadowSupported = (light: DirectorLight) => light.type === 'directional' || light.type === 'point' || light.type === 'spot';
const intensityLabel = (light: DirectorLight) => light.type === 'point' || light.type === 'spot' ? '强度（坎德拉 cd）' : light.type === 'area' ? '强度（尼特 nit）' : '强度（相对值）';
const lightTypeZh = { directional: '平行光', point: '点光', spot: '聚光灯', area: '区域光', ambient: '环境光' } as const;
const ageGroupZh = { child: '儿童', teen: '青少年', adult: '成年', elderly: '老年' } as const;
const poseCategories = ['站立', '移动', '坐蹲', '跳跃', '武器/动作', '互动'] as const;
const cameraKeyframeTime = (id?: string) => id?.startsWith('camera-keyframe:') ? Number(id.slice('camera-keyframe:'.length)) : undefined;

export function SelectionInspector() {
  const shot = useDirectorStore((state) => state.getActiveShot());
  const playhead = useDirectorStore((state) => state.playhead);
  const selected = useDirectorStore((state) => state.selectedObjectId);
  const selectObject = useDirectorStore((state) => state.selectObject);
  const setPlayhead = useDirectorStore((state) => state.setPlayhead);
  const editActorTransform = useDirectorStore((state) => state.updateActorTransformAxis);
  const updateCamera = useDirectorStore((state) => state.updateCamera);
  const updateCameraVector = useDirectorStore((state) => state.updateCameraVector);
  const updateLight = useDirectorStore((state) => state.updateLight);
  const updateLightVector = useDirectorStore((state) => state.updateLightVector);
  const setLightShadow = useDirectorStore((state) => state.setLightCastShadow);
  const actor = shot.actors.find((item) => item.id === selected);
  const light = shot.lights.find((item) => item.id === selected);
  const isCamera = selected === shot.camera.id;
  const keyframeTime = cameraKeyframeTime(selected);
  const editable = shot.status !== 'APPROVED';

  if (!actor && !light && !isCamera && keyframeTime === undefined) return <Inspector />;

  const actorTransform = actor ? sampleActorTransform(actor, playhead) : undefined;
  const sampledLight = light ? sampleLight(light, playhead) : undefined;
  const camera = sampleCamera(shot.camera, playhead);
  const editActor = (field: keyof Transform, axis: keyof Vec3, value: number) => actor && editActorTransform(actor.id, field, axis, value);
  const kind = actor ? 'actor' : light ? 'light' : isCamera ? 'camera' : 'camera-keyframe';
  const title = actor?.name ?? light?.name ?? (isCamera ? shot.camera.name : `机位 ${keyframeTime?.toFixed(2)} 秒`);
  const typeLabel = actor ? '人物主体' : light ? lightTypeZh[light.type] : isCamera ? '摄影机' : '摄影机机位';

  return <aside className="inspector selection-inspector" data-selection-inspector data-selection-kind={kind}>
    <section className="selection-inspector-header">
      <div className="selection-inspector-kicker">当前选择 · {typeLabel}</div>
      <strong>{title}</strong>
      <div className="selection-inspector-actions">
        <button className="wide" onClick={() => selectObject(undefined)}>镜头级设置</button>
      </div>
      {!editable && <div className="asset-message ok">已批准镜头为只读。</div>}
    </section>

    {actor && actorTransform && <>
      <section data-subject-properties="actor">
        <div className="section-title">主体属性 · 场面调度</div>
        <div className="meta">{actor.demographics.sex === 'male' ? '男' : '女'} · {ageGroupZh[actor.demographics.ageGroup]} · {actor.demographics.ageYears} 岁 · 身高 {actor.demographics.heightM.toFixed(2)} 米 · 眼高 {actor.eyeHeight.toFixed(2)} 米</div>
        {axes.map((axis) => <NumberField disabled={!editable} key={`actor-p-${axis}`} label={`位置 ${axis.toUpperCase()}（米）`} value={actorTransform.position[axis]} onChange={(value) => editActor('position', axis, value)} />)}
        {axes.map((axis) => <NumberField disabled={!editable} key={`actor-r-${axis}`} label={`整体旋转 ${axis.toUpperCase()}（°）`} value={radToDeg(actorTransform.rotation[axis])} step={1} onChange={(value) => editActor('rotation', axis, degToRad(value))} />)}
        {axes.map((axis) => <NumberField disabled={!editable} key={`actor-s-${axis}`} label={`整体缩放 ${axis.toUpperCase()}`} value={actorTransform.scale[axis]} step={0.05} onChange={(value) => editActor('scale', axis, value)} />)}
        <div className="section-title">动作 / 姿势</div>
        <select disabled={!editable} value={actor.pose.startsWith('custom:') ? '' : actor.pose} onChange={(event) => applyPresetPose(actor.id, event.target.value as PosePresetId)}>
          <option value="" disabled>自定义姿势</option>
          {poseCategories.map((category) => <optgroup key={category} label={category}>{posePresetList.filter((pose) => pose.category === category).map((pose) => <option key={pose.id} value={pose.id}>{pose.label}</option>)}</optgroup>)}
        </select>
        <div className="meta">需要落手位的预设已使用身高比例 IK，手腕朝向仍可单独调节；不同身高角色不会再用同一组肩肘角硬套。</div>
      </section>
      <section data-subject-rig><PoseEditorPanel actor={actor} /></section>
    </>}

    {light && sampledLight && <section data-subject-properties="light">
      <div className="section-title">主体属性 · {lightTypeZh[light.type]}</div>
      <NumberField disabled={!editable} label={intensityLabel(sampledLight)} value={sampledLight.intensity} step={0.1} onChange={(value) => updateLight(light.id, 'intensity', value)} />
      <NumberField disabled={!editable} label="色温（K）" value={sampledLight.colorTemperatureK} step={100} onChange={(value) => updateLight(light.id, 'colorTemperatureK', value)} />
      {sampledLight.type !== 'ambient' && axes.map((axis) => <NumberField disabled={!editable} key={`light-p-${axis}`} label={`位置 ${axis.toUpperCase()}（米）`} value={sampledLight.position[axis]} onChange={(value) => updateLightVector(light.id, 'position', axis, value)} />)}
      {sampledLight.type !== 'ambient' && axes.map((axis) => <NumberField disabled={!editable} key={`light-t-${axis}`} label={`目标 ${axis.toUpperCase()}（米）`} value={(sampledLight.target ?? { x: 0, y: 1.2, z: 0 })[axis]} onChange={(value) => updateLightVector(light.id, 'target', axis, value)} />)}
      <label className="toggle-field"><span>投射阴影</span><input type="checkbox" disabled={!editable || !shadowSupported(sampledLight)} checked={shadowSupported(sampledLight) && light.castShadow} onChange={(event) => setLightShadow(light.id, event.target.checked)} /></label>
      <div className="meta">关键帧 {light.path.length} · {sampledLight.type === 'ambient' ? '环境光只负责最低照度，建议保持低强度以保留人物明暗层次。' : '位置、目标、强度和色温均针对当前灯具独立调节。'}</div>
    </section>}

    {isCamera && <section data-subject-properties="camera">
      <div className="section-title">主体属性 · 摄影机</div>
      <NumberField disabled={!editable} label="焦距（毫米）" value={camera.focalLengthMm} step={1} onChange={(value) => updateCamera('focalLengthMm', value)} />
      <NumberField disabled={!editable} label="传感器宽度（毫米）" value={camera.sensorWidthMm} step={0.1} onChange={setActiveShotSensorWidthMm} />
      <select disabled={!editable} value="" onChange={(event) => { if (event.target.value) updateCamera('focalLengthMm', Number(event.target.value)); }}><option value="">焦段预设…</option>{lensPresetList.map((lens) => <option key={lens.id} value={lens.focalLengthMm}>{lens.label} · {lens.use}</option>)}</select>
      <NumberField disabled={!editable} label="光圈（f-stop）" value={camera.aperture} step={0.1} onChange={(value) => updateCamera('aperture', value)} />
      <NumberField disabled={!editable} label="对焦距离（米）" value={camera.focusDistanceM} step={0.1} onChange={(value) => updateCamera('focusDistanceM', value)} />
      {axes.map((axis) => <NumberField disabled={!editable} key={`camera-p-${axis}`} label={`位置 ${axis.toUpperCase()}（米）`} value={camera.position[axis]} onChange={(value) => updateCameraVector('position', axis, value)} />)}
      {axes.map((axis) => <NumberField disabled={!editable} key={`camera-t-${axis}`} label={`目标 ${axis.toUpperCase()}（米）`} value={camera.target[axis]} onChange={(value) => updateCameraVector('target', axis, value)} />)}
      <div className="meta">当前摄影机有 {shot.camera.path.length} 个动画机位。摄影机辅助线的显示/隐藏在 3D 视口工具栏单独控制，不影响摄影机本体与最终镜头画面。</div>
    </section>}

    {keyframeTime !== undefined && Number.isFinite(keyframeTime) && <section data-subject-properties="camera-keyframe">
      <div className="section-title">主体属性 · 摄影机机位</div>
      <strong>{keyframeTime.toFixed(2)} 秒</strong>
      <div className="meta">这是摄影机动画的实体关键帧。可在 3D 中 W 移动、E 旋转、Delete 删除；先跳到该时间再编辑镜头参数可确保修改写入对应整帧。</div>
      <button className="wide" onClick={() => setPlayhead(keyframeTime)}>跳到该机位时间</button>
    </section>}
  </aside>;
}
