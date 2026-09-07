import { useMemo, useState } from 'react';
import type { Actor } from '../domain/model';
import {
  defaultHeadLookAt,
  defaultIkPlacement,
  humanoidJointIds,
  humanoidJointLimits,
  ikLimbLabels,
  rigControlLabels,
  type HumanoidJointId,
  type IkLimbId,
  type RigAxis,
  type RigControlId,
  type RigVec3,
} from '../domain/humanoidRig';
import { controlPosition, jointDrivenByIk, sampleActorRig } from '../characters/rigRuntime';
import { useDirectorStore } from '../store/directorStore';
import { usePoseUiStore } from '../store/poseUiStore';
import {
  addActorPoseKeyframe,
  applyCustomPose,
  clearActorPoseAnimation,
  deleteCustomPose,
  mirrorActorPose,
  removeActorPoseKeyframe,
  resetActorRig,
  saveCustomPose,
  setActorHeadLookAt,
  setActorHeadLookAtEnabled,
  setActorIkEnabled,
  setActorIkLocked,
  setActorIkPole,
  setActorIkTarget,
  setActorJointAxis,
} from '../store/poseRegistry';
import { timeToFrame } from '../editorial/timelineEngine';

const radToDeg = (value: number) => value * 180 / Math.PI;
const degToRad = (value: number) => value * Math.PI / 180;
const axes: RigAxis[] = ['x', 'y', 'z'];
const axisLabel: Record<RigAxis, string> = { x: 'X', y: 'Y', z: 'Z' };

const limbControls: Record<IkLimbId, { target: RigControlId; pole: RigControlId }> = {
  leftHand: { target: 'leftHandTarget', pole: 'leftElbowPole' },
  rightHand: { target: 'rightHandTarget', pole: 'rightElbowPole' },
  leftFoot: { target: 'leftFootTarget', pole: 'leftKneePole' },
  rightFoot: { target: 'rightFootTarget', pole: 'rightKneePole' },
};

function Vec3Editor({ label, value, disabled, onChange }: { label: string; value: RigVec3; disabled?: boolean; onChange: (value: RigVec3) => void }) {
  return <div className="pose-vec-editor"><b>{label}</b>{axes.map((axis) => <label key={axis}><span>{axisLabel[axis]}</span><input disabled={disabled} type="number" step={0.02} value={Number(value[axis].toFixed(3))} onChange={(event) => onChange({ ...value, [axis]: Number(event.target.value) })} /></label>)}</div>;
}

export function PoseEditorPanel({ actor }: { actor: Actor }) {
  const shot = useDirectorStore((state) => state.getActiveShot());
  const playhead = useDirectorStore((state) => state.playhead);
  const customPoses = useDirectorStore((state) => state.project.customPoses ?? []);
  const enabled = usePoseUiStore((state) => state.enabled && state.actorId === actor.id);
  const selectedJoint = usePoseUiStore((state) => state.selectedJoint);
  const selectedControl = usePoseUiStore((state) => state.selectedControl);
  const setEnabled = usePoseUiStore((state) => state.setEnabled);
  const selectJoint = usePoseUiStore((state) => state.selectJoint);
  const selectControl = usePoseUiStore((state) => state.selectControl);
  const [poseName, setPoseName] = useState('');
  const rig = useMemo(() => sampleActorRig(actor, playhead), [actor, playhead]);
  const activeJoint = selectedJoint ?? 'spine_02';
  const limit = humanoidJointLimits[activeJoint];
  const jointRotation = rig.fk[activeJoint] ?? { x: 0, y: 0, z: 0 };
  const editable = shot.status !== 'APPROVED';
  const currentFrame = timeToFrame(playhead, shot.fps);

  const savePose = () => {
    if (!poseName.trim()) return;
    saveCustomPose(actor.id, poseName);
    setPoseName('');
  };

  return <div className="pose-editor-panel">
    <div className="section-title">人物骨骼调姿</div>
    <div className="pose-editor-toolbar">
      <button disabled={!editable} className={enabled ? 'active' : ''} onClick={() => setEnabled(!enabled, actor.id)}>{enabled ? '退出 3D 调姿' : '进入 3D 调姿'}</button>
      <button disabled={!editable} onClick={() => mirrorActorPose(actor.id)}>左右镜像</button>
      <button disabled={!editable} onClick={() => resetActorRig(actor.id)}>恢复当前预设</button>
    </div>
    <div className="meta">FK 用于逐关节旋转；IK 可直接拖手脚目标，肘/膝方向由 Pole 控制。所有编辑进入工程 Undo / Redo；存在姿势轨后会自动写当前整帧。</div>

    <div className="pose-subsection">
      <div className="section-title">FK 单关节</div>
      <select value={activeJoint} onChange={(event) => selectJoint(actor.id, event.target.value as HumanoidJointId)}>
        {(['躯干', '头颈', '左臂', '右臂', '左腿', '右腿'] as const).map((group) => <optgroup key={group} label={group}>{humanoidJointIds.filter((joint) => humanoidJointLimits[joint].group === group).map((joint) => <option key={joint} value={joint}>{humanoidJointLimits[joint].label}</option>)}</optgroup>)}
      </select>
      <button disabled={!editable || jointDrivenByIk(rig, activeJoint)} className={selectedJoint === activeJoint ? 'active' : ''} onClick={() => selectJoint(actor.id, activeJoint)}>在 3D 中旋转“{limit.label}”</button>
      {jointDrivenByIk(rig, activeJoint) && <div className="asset-message ok">该关节当前由 IK 驱动；关闭对应 IK 后可直接 FK 旋转。</div>}
      <div className="joint-axis-grid">{axes.map((axis) => <label key={axis}><span>{axisLabel[axis]} · {limit.minDeg[axis]}° ～ {limit.maxDeg[axis]}°</span><input disabled={!editable || jointDrivenByIk(rig, activeJoint)} type="range" min={limit.minDeg[axis]} max={limit.maxDeg[axis]} step={1} value={Math.round(radToDeg(jointRotation[axis]))} onChange={(event) => setActorJointAxis(actor.id, activeJoint, axis, degToRad(Number(event.target.value)))} /><input disabled={!editable || jointDrivenByIk(rig, activeJoint)} type="number" min={limit.minDeg[axis]} max={limit.maxDeg[axis]} step={1} value={Math.round(radToDeg(jointRotation[axis]))} onChange={(event) => setActorJointAxis(actor.id, activeJoint, axis, degToRad(Number(event.target.value)))} /></label>)}</div>
    </div>

    <div className="pose-subsection">
      <div className="section-title">手脚 IK / 肘膝 Pole</div>
      {(Object.keys(limbControls) as IkLimbId[]).map((limb) => {
        const state = rig.ik[limb];
        const controls = limbControls[limb];
        const defaults = defaultIkPlacement(actor.demographics.heightM, limb);
        const target = state.target ?? defaults.target!;
        const pole = state.pole ?? defaults.pole!;
        return <div className="ik-card" key={limb}>
          <div className="ik-card-head"><strong>{ikLimbLabels[limb]}</strong><label><input disabled={!editable} type="checkbox" checked={state.enabled} onChange={(event) => setActorIkEnabled(actor.id, limb, event.target.checked)} />启用 IK</label><label><input disabled={!editable || !state.enabled} type="checkbox" checked={state.locked} onChange={(event) => setActorIkLocked(actor.id, limb, event.target.checked)} />锁定目标</label></div>
          <div className="pose-editor-toolbar"><button disabled={!editable || !state.enabled || state.locked} className={selectedControl === controls.target ? 'active' : ''} onClick={() => selectControl(actor.id, controls.target)}>3D 拖动 {rigControlLabels[controls.target]}</button><button disabled={!editable || !state.enabled || state.locked} className={selectedControl === controls.pole ? 'active' : ''} onClick={() => selectControl(actor.id, controls.pole)}>3D 拖动 {rigControlLabels[controls.pole]}</button></div>
          <Vec3Editor label="目标位置（人物局部米制）" value={target} disabled={!editable || !state.enabled || state.locked} onChange={(value) => setActorIkTarget(actor.id, limb, value)} />
          <Vec3Editor label="弯曲方向 Pole" value={pole} disabled={!editable || !state.enabled || state.locked} onChange={(value) => setActorIkPole(actor.id, limb, value)} />
        </div>;
      })}
    </div>

    <div className="pose-subsection">
      <div className="section-title">头部 / 视线目标</div>
      <label className="toggle-field"><span>启用头部注视</span><input disabled={!editable} type="checkbox" checked={rig.headLookAt.enabled} onChange={(event) => setActorHeadLookAtEnabled(actor.id, event.target.checked)} /></label>
      <button disabled={!editable || !rig.headLookAt.enabled} className={selectedControl === 'headLookAt' ? 'active' : ''} onClick={() => selectControl(actor.id, 'headLookAt')}>在 3D 中拖动注视目标</button>
      <Vec3Editor label="注视目标（人物局部米制）" value={rig.headLookAt.target ?? controlPosition(actor, rig, 'headLookAt') ?? defaultHeadLookAt(actor.demographics.heightM)} disabled={!editable || !rig.headLookAt.enabled} onChange={(value) => setActorHeadLookAt(actor.id, value)} />
    </div>

    <div className="pose-subsection">
      <div className="section-title">姿势关键帧 · 第 {currentFrame} 帧</div>
      <div className="pose-editor-toolbar"><button disabled={!editable} onClick={() => addActorPoseKeyframe(actor.id)}>+ 当前帧姿势关键帧</button>{(actor.posePath?.length ?? 0) > 0 && <button disabled={!editable} onClick={() => clearActorPoseAnimation(actor.id)}>烘焙当前姿势并清空姿势轨</button>}</div>
      <div className="pose-key-list">{(actor.posePath ?? []).map((key) => <button key={key.time} title="删除该姿势关键帧" onClick={() => removeActorPoseKeyframe(actor.id, key.time)}>K · F{timeToFrame(key.time, shot.fps)} ×</button>)}</div>
      <div className="meta">首个姿势关键帧建立后，FK / IK / 注视编辑自动写当前整帧；帧间旋转使用最短角插值，IK 目标使用线性空间插值。</div>
    </div>

    <div className="pose-subsection">
      <div className="section-title">自定义姿势库</div>
      <div className="pose-save-row"><input value={poseName} placeholder="例如：右手扶桌" onChange={(event) => setPoseName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') savePose(); }} /><button disabled={!editable || !poseName.trim()} onClick={savePose}>保存当前姿势</button></div>
      <div className="custom-pose-list">{customPoses.map((pose) => <div key={pose.id}><button disabled={!editable} onClick={() => applyCustomPose(actor.id, pose.id)}>{pose.name}</button><button disabled={!editable} className="danger" onClick={() => deleteCustomPose(pose.id)}>删除</button></div>)}{customPoses.length === 0 && <span className="meta">尚未保存自定义姿势。</span>}</div>
    </div>
  </div>;
}
