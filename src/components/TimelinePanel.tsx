import { useDirectorStore } from '../store/directorStore';
import type { AudioClip } from '../domain/model';
import { cameraRigPresets, type CameraRigPresetId } from '../domain/cameraRigs';
import { sampleCamera } from '../utils/animation';

const kinds: AudioClip['kind'][] = ['dialogue', 'music', 'sfx', 'ambience'];

export function TimelinePanel() {
  const shot = useDirectorStore((s) => s.getActiveShot());
  const time = useDirectorStore((s) => s.playhead);
  const setTime = useDirectorStore((s) => s.setPlayhead);
  const addAudio = useDirectorStore((s) => s.addAudioPlaceholder);
  const addActorKeyframe = useDirectorStore((s) => s.addActorKeyframe);
  const removeActorKeyframe = useDirectorStore((s) => s.removeActorKeyframe);
  const addCameraKeyframe = useDirectorStore((s) => s.addCameraKeyframe);
  const removeCameraKeyframe = useDirectorStore((s) => s.removeCameraKeyframe);
  const applyCameraRigPreset = useDirectorStore((s) => s.applyCameraRigPreset);
  const camera = sampleCamera(shot.camera, time);

  return <div className="timeline-page">
    <div className="timeline-head"><span className="chip">Timeline / Animatic</span><strong>{time.toFixed(2)}s</strong><span>{shot.fps} fps · {Math.round(shot.duration * shot.fps)} frames · frame {Math.round(time * shot.fps)}</span></div>
    <input className="scrubber" type="range" min={0} max={shot.duration} step={1 / shot.fps} value={time} onChange={(e) => setTime(Number(e.target.value))} />

    <div className="track camera-track">
      <b>CAMERA</b>
      <div className="clip">{shot.camera.name} · {camera.focalLengthMm.toFixed(0)}mm</div>
      {shot.camera.path.map((frame) => <button className="wide" key={`camera-${frame.time}`} title="点击定位；Shift+点击删除" onClick={(event) => event.shiftKey ? removeCameraKeyframe(frame.time) : setTime(frame.time)}>K {frame.time.toFixed(2)}s</button>)}
      <button className="wide" onClick={addCameraKeyframe}>+ Camera Key @ {time.toFixed(2)}s</button>
    </div>

    <div className="track camera-track">
      <b>CAM RIGS</b>
      {(Object.entries(cameraRigPresets) as [CameraRigPresetId, (typeof cameraRigPresets)[CameraRigPresetId]][]).map(([id, preset]) => <button className="wide" key={id} title={preset.description} onClick={() => applyCameraRigPreset(id)}>{preset.label}</button>)}
    </div>

    {shot.actors.map((actor) => <div className="track actor-track" key={actor.id}>
      <b>{actor.name}</b>
      <div className="clip">{actor.action} · {actor.path.length} keys</div>
      {actor.path.map((frame) => <button className="wide" key={`${actor.id}-${frame.time}`} title="点击定位；Shift+点击删除" onClick={(event) => event.shiftKey ? removeActorKeyframe(actor.id, frame.time) : setTime(frame.time)}>K {frame.time.toFixed(2)}s</button>)}
      <button className="wide" onClick={() => addActorKeyframe(actor.id)}>+ Actor Key @ {time.toFixed(2)}s</button>
    </div>)}

    {kinds.map((kind) => <div className="track audio-track" key={kind}><b>{kind.toUpperCase()}</b>{shot.audio.filter((audio) => audio.kind === kind).map((audio) => <div className="clip" key={audio.id}>{audio.name} · {audio.duration}s</div>)}<button onClick={() => addAudio(kind)}>+ 占位音频</button></div>)}
    <div className="timeline-note">关键帧按 Shot FPS 吸附到整帧。已有 Key Track 的人物或摄影机在 Gizmo / 数值编辑时会自动写入当前帧；所有修改进入同一 Undo/Redo 历史。Shift+点击关键帧可删除。</div>
  </div>;
}
