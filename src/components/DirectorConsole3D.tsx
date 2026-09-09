import { DirectorViewport } from '../engine/DirectorViewport';
import { directorLightDirectionPresets, directorLightToolPresets } from '../domain/directorLights';
import { useDirectorStore } from '../store/directorStore';
import { addDirectorLight, aimDirectorLightAtStage, duplicateDirectorLight, removeDirectorLight, setDirectorLightDirection } from '../store/lightRegistry';
import { sampleActorTransform, sampleCamera } from '../utils/animation';
import { cameraDepthOfField, focalLengthToHorizontalFovDeg, focalLengthToVerticalFovDeg } from '../utils/math';
import type { Vec3 } from '../domain/model';

const lightTypeZh = { directional: '平行光', point: '点光', spot: '聚光灯', area: '区域光', ambient: '环境光' } as const;

function distanceBetween(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function formatDistanceM(value: number) {
  if (!Number.isFinite(value)) return '∞';
  if (value >= 100) return `${value.toFixed(0)} m`;
  if (value >= 10) return `${value.toFixed(1)} m`;
  return `${value.toFixed(2)} m`;
}

function clampFocusDistance(value: number) {
  return Math.min(100000, Math.max(0.01, value));
}

export function DirectorConsole3D() {
  const shot = useDirectorStore((state) => state.getActiveShot());
  const playhead = useDirectorStore((state) => state.playhead);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const selectObject = useDirectorStore((state) => state.selectObject);
  const updateCamera = useDirectorStore((state) => state.updateCamera);
  const addLightKeyframe = useDirectorStore((state) => state.addLightKeyframe);
  const selectedLight = shot.lights.find((light) => light.id === selectedObjectId);
  const selectedActor = shot.actors.find((actor) => actor.id === selectedObjectId);
  const camera = sampleCamera(shot.camera, playhead);
  const depthOfField = cameraDepthOfField(camera, shot.frameAspect);
  const horizontalFovDeg = focalLengthToHorizontalFovDeg(camera.focalLengthMm, camera.sensorWidthMm);
  const verticalFovDeg = focalLengthToVerticalFovDeg(camera.focalLengthMm, camera.sensorWidthMm, shot.frameAspect);
  const targetDistanceM = distanceBetween(camera.position, camera.target);
  const actorTransform = selectedActor ? sampleActorTransform(selectedActor, playhead) : undefined;
  const selectedActorEye = selectedActor && actorTransform ? {
    x: actorTransform.position.x,
    y: actorTransform.position.y + selectedActor.eyeHeight * actorTransform.scale.y,
    z: actorTransform.position.z,
  } : undefined;
  const selectedActorDistanceM = selectedActorEye ? distanceBetween(camera.position, selectedActorEye) : undefined;
  const editable = shot.status !== 'APPROVED';

  const setFocus = (distanceM: number) => updateCamera('focusDistanceM', clampFocusDistance(distanceM));

  return <div className="director-console-3d">
    <DirectorViewport />

    <div className="director-console-hud" aria-label="3D 导演台状态">
      <div><b>3D 导演台</b><span>{shot.name} · v{shot.version}</span></div>
      <div><span>人物 {shot.actors.length}</span><span>灯光 {shot.lights.length}</span><span>{shot.status === 'APPROVED' ? '已批准 · 只读' : '可编辑'}</span></div>
    </div>

    <section className="director-camera-assistant" aria-label="摄影助手" data-camera-assistant>
      <div className="director-camera-assistant-title">
        <div><b>摄影助手</b><span>焦段 · 景深 · 对焦</span></div>
        <span>{camera.focalLengthMm.toFixed(0)} mm · f/{camera.aperture.toFixed(1)}</span>
      </div>
      <div className="director-camera-metrics">
        <div><span>视场角</span><b>{horizontalFovDeg.toFixed(1)}° × {verticalFovDeg.toFixed(1)}°</b></div>
        <div><span>对焦距离</span><b>{formatDistanceM(camera.focusDistanceM)}</b></div>
        <div><span>景深范围</span><b>{depthOfField.validFocus ? `${formatDistanceM(depthOfField.nearM)} – ${formatDistanceM(depthOfField.farM)}` : '无效对焦'}</b></div>
        <div><span>超焦距</span><b>{formatDistanceM(depthOfField.hyperfocalM)}</b></div>
      </div>
      <div className="director-camera-focus-actions">
        <button disabled={!editable} onClick={() => setFocus(targetDistanceM)}>对焦镜头目标</button>
        <button disabled={!editable || selectedActorDistanceM === undefined} onClick={() => selectedActorDistanceM !== undefined && setFocus(selectedActorDistanceM)}>对焦选中人物</button>
        <button disabled={!editable || !Number.isFinite(depthOfField.hyperfocalM)} onClick={() => setFocus(depthOfField.hyperfocalM)}>超焦距</button>
      </div>
      <div className="director-camera-optics-note">传感器 {camera.sensorWidthMm.toFixed(1)} × {depthOfField.sensorHeightMm.toFixed(1)} mm · CoC {depthOfField.circleOfConfusionMm.toFixed(3)} mm{selectedActorDistanceM !== undefined ? ` · 人物眼位 ${formatDistanceM(selectedActorDistanceM)}` : ''}</div>
    </section>

    <div className="director-light-dock" aria-label="灯光台">
      <div className="director-light-dock-title">
        <div><b>灯光台</b><span>在 3D 导演台直接摆灯 · 添加后自动选中，可用移动操纵器拖拽</span></div>
        <div className="director-light-count">{shot.lights.length} 灯</div>
      </div>

      <div className="director-light-tools">
        {directorLightToolPresets.map((preset) => <button
          key={preset.id}
          disabled={!editable}
          title={preset.description}
          onClick={() => addDirectorLight(preset.id)}
          data-light-preset={preset.id}
        >
          <span className={`director-light-icon type-${preset.type}`}>{preset.type === 'area' ? '▭' : preset.type === 'spot' ? '◢' : preset.type === 'point' ? '●' : preset.type === 'directional' ? '☀' : '◌'}</span>
          <span><b>{preset.shortLabel}</b><small>{lightTypeZh[preset.type]}</small></span>
        </button>)}
      </div>

      <div className="director-light-existing" aria-label="当前镜头灯具">
        {shot.lights.map((light) => <button key={light.id} className={selectedObjectId === light.id ? 'active' : ''} onClick={() => selectObject(light.id)} title={`选择 ${light.name}`}>
          <span className={`light-dot type-${light.type}`} />
          <span>{light.name}</span>
          <small>{lightTypeZh[light.type]}</small>
        </button>)}
        {shot.lights.length === 0 && <span className="director-light-empty">当前镜头没有灯光。可从上方灯具架直接加入。</span>}
      </div>

      {selectedLight && <div className="director-selected-light" data-selected-light={selectedLight.id}>
        <div className="director-selected-light-main">
          <span className={`light-dot type-${selectedLight.type}`} />
          <div><b>{selectedLight.name}</b><span>{lightTypeZh[selectedLight.type]} · {selectedLight.intensity.toFixed(2)} · {Math.round(selectedLight.colorTemperatureK)}K · {selectedLight.castShadow ? '阴影开' : '阴影关'}</span></div>
        </div>
        <div className="director-selected-light-actions">
          {selectedLight.type !== 'ambient' && <div className="director-light-directions" aria-label="快速打光方向">
            <span>方向</span>
            {directorLightDirectionPresets.map((direction) => <button key={direction.id} disabled={!editable} data-light-direction={direction.id} onClick={() => setDirectorLightDirection(selectedLight.id, direction.id)}>{direction.label}</button>)}
          </div>}
          {selectedLight.type !== 'point' && selectedLight.type !== 'ambient' && <button disabled={!editable} onClick={() => aimDirectorLightAtStage(selectedLight.id)}>瞄准人物中心</button>}
          <button disabled={!editable} onClick={() => addLightKeyframe(selectedLight.id)}>当前帧关键帧</button>
          <button disabled={!editable} onClick={() => duplicateDirectorLight(selectedLight.id)}>复制灯具</button>
          <button disabled={!editable} className="danger" onClick={() => removeDirectorLight(selectedLight.id)}>删除</button>
        </div>
      </div>}
    </div>
  </div>;
}
