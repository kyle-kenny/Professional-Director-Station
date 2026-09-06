import { useDirectorStore } from '../store/directorStore';
import type { AudioClip } from '../domain/model';

const kinds: AudioClip['kind'][]=['dialogue','music','sfx','ambience'];
export function TimelinePanel(){
 const shot=useDirectorStore((s)=>s.getActiveShot()); const t=useDirectorStore((s)=>s.playhead); const setT=useDirectorStore((s)=>s.setPlayhead); const add=useDirectorStore((s)=>s.addAudioPlaceholder);
 return <div className="timeline-page">
  <div className="timeline-head"><span className="chip">Timeline / Animatic</span><strong>{t.toFixed(2)}s</strong><span>{shot.fps} fps · {Math.round(shot.duration*shot.fps)} frames</span></div>
  <input className="scrubber" type="range" min={0} max={shot.duration} step={1/shot.fps} value={t} onChange={(e)=>setT(Number(e.target.value))}/>
  <div className="track camera-track"><b>CAMERA</b><div className="clip">{shot.camera.name} · {shot.camera.focalLengthMm}mm</div></div>
  <div className="track actor-track"><b>BLOCKING</b>{shot.actors.map(a=><div className="clip" key={a.id}>{a.name} · {a.action}</div>)}</div>
  {kinds.map(kind=><div className="track audio-track" key={kind}><b>{kind.toUpperCase()}</b>{shot.audio.filter(a=>a.kind===kind).map(a=><div className="clip" key={a.id}>{a.name} · {a.duration}s</div>)}<button onClick={()=>add(kind)}>+ 占位音频</button></div>)}
  <div className="timeline-note">V1 音频台保留专业 Track/Clip 数据模型；下一阶段接入波形、媒体持久化、淡入淡出与 OTIO 交换。</div>
 </div>
}
