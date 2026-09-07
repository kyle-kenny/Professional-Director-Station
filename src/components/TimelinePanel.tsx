import { useEffect, useRef, useState } from 'react';
import { useDirectorStore } from '../store/directorStore';
import type { AudioClip, TimelineMarker } from '../domain/model';
import { cameraRigPresets, type CameraRigPresetId } from '../domain/cameraRigs';
import { lensPresetList } from '../domain/lensPresets';
import { sampleCamera, sampleLight } from '../utils/animation';
import { frameFromElapsed, frameToTime, timeToFrame, totalFrames } from '../editorial/timelineEngine';
import { importAudioFile } from '../audio/audioImport';
import { deleteAudioMedia } from '../storage/audioMediaStore';
import { playShotAudio, type AudioPlaybackHandle } from '../audio/audioTransport';
import { WaveformStrip } from './WaveformStrip';
import { exportShotToOtio, parseOtioEditorial } from '../editorial/otio';
import { downloadText, exportShotReferenceMp4 } from '../editorial/referenceExport';
import { audioKindZh } from '../i18n/zhCN';

const kinds: AudioClip['kind'][] = ['dialogue', 'music', 'sfx', 'ambience'];
const markerColors: TimelineMarker['color'][] = ['amber', 'blue', 'red', 'green', 'violet'];
const markerColorZh: Record<TimelineMarker['color'], string> = { amber: '琥珀', blue: '蓝色', red: '红色', green: '绿色', violet: '紫色' };
const actionZh: Record<string, string> = { idle: '静止', dialogue: '对话', hold: '保持', point: '指向', guard: '警戒', crouch: '蹲伏', sit: '坐姿', walk: '行走' };

function formatTimecode(frame: number, fps: number): string {
  const safe = Math.max(0, Math.round(frame));
  const frames = safe % fps;
  const secondsTotal = Math.floor(safe / fps);
  const seconds = secondsTotal % 60;
  const minutesTotal = Math.floor(secondsTotal / 60);
  const minutes = minutesTotal % 60;
  const hours = Math.floor(minutesTotal / 60);
  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, '0')).join(':');
}

const safeFileName = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'shot';

export function TimelinePanel() {
  const shot = useDirectorStore((s) => s.getActiveShot());
  const time = useDirectorStore((s) => s.playhead);
  const setTime = useDirectorStore((s) => s.setPlayhead);
  const setFrame = useDirectorStore((s) => s.setPlayheadFrame);
  const stepFrames = useDirectorStore((s) => s.stepPlayheadFrames);
  const updateCamera = useDirectorStore((s) => s.updateCamera);
  const addAudioPlaceholder = useDirectorStore((s) => s.addAudioPlaceholder);
  const addAudioClip = useDirectorStore((s) => s.addAudioClip);
  const removeAudioClip = useDirectorStore((s) => s.removeAudioClip);
  const updateAudioClip = useDirectorStore((s) => s.updateAudioClip);
  const addMarker = useDirectorStore((s) => s.addMarker);
  const removeMarker = useDirectorStore((s) => s.removeMarker);
  const addNote = useDirectorStore((s) => s.addNote);
  const removeNote = useDirectorStore((s) => s.removeNote);
  const replaceEditorial = useDirectorStore((s) => s.replaceEditorial);
  const addActorKeyframe = useDirectorStore((s) => s.addActorKeyframe);
  const removeActorKeyframe = useDirectorStore((s) => s.removeActorKeyframe);
  const addCameraKeyframe = useDirectorStore((s) => s.addCameraKeyframe);
  const removeCameraKeyframe = useDirectorStore((s) => s.removeCameraKeyframe);
  const addLightKeyframe = useDirectorStore((s) => s.addLightKeyframe);
  const removeLightKeyframe = useDirectorStore((s) => s.removeLightKeyframe);
  const applyCameraRigPreset = useDirectorStore((s) => s.applyCameraRigPreset);

  const [playing, setPlaying] = useState(false);
  const [markerLabel, setMarkerLabel] = useState('');
  const [markerColor, setMarkerColor] = useState<TimelineMarker['color']>('amber');
  const [noteText, setNoteText] = useState('');
  const [message, setMessage] = useState('');
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const audioHandle = useRef<AudioPlaybackHandle | null>(null);
  const raf = useRef<number | null>(null);
  const camera = sampleCamera(shot.camera, time);
  const maxFrame = totalFrames(shot.duration, shot.fps);
  const currentFrame = timeToFrame(time, shot.fps);

  const stopPlayback = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    audioHandle.current?.stop();
    audioHandle.current = null;
    setPlaying(false);
  };

  useEffect(() => stopPlayback, [shot.id]);

  const startPlayback = async () => {
    stopPlayback();
    const startFrame = currentFrame >= maxFrame ? 0 : currentFrame;
    setFrame(startFrame);
    setPlaying(true);
    try {
      audioHandle.current = await playShotAudio(shot, frameToTime(startFrame, shot.fps));
      if (audioHandle.current.missingClipIds.length) setMessage(`${audioHandle.current.missingClipIds.length} 个音频片段缺少本地缓存；画面继续播放。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '音频播放不可用；画面继续播放。');
    }
    const started = performance.now();
    const loop = (now: number) => {
      const frame = frameFromElapsed(startFrame, now - started, shot.duration, shot.fps);
      setFrame(frame);
      if (frame >= maxFrame) { stopPlayback(); return; }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  const onAudioFile = async (kind: AudioClip['kind'], file?: File) => {
    if (!file) return;
    setMessage(`正在分析 ${file.name}…`);
    try {
      const clip = await importAudioFile(file, kind, time, shot.duration, shot.fps);
      try { addAudioClip(clip); }
      catch (error) { await deleteAudioMedia(clip.id).catch(() => undefined); throw error; }
      setMessage(`${file.name} 已解码、生成波形并加入${audioKindZh[kind]}轨。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '音频导入失败。'); }
  };

  const exportOtio = () => {
    downloadText(exportShotToOtio(shot), `${safeFileName(shot.name)}.otio`, 'application/vnd.otio+json');
    setMessage('OTIO 已导出；帧率、音频摆位、标记与导演备注均已写入。');
  };

  const importOtio = async (file?: File) => {
    if (!file) return;
    try {
      const editorial = parseOtioEditorial(await file.text(), shot.fps);
      replaceEditorial(editorial);
      setMessage(`OTIO 已导入：${editorial.audio.length} 条音频 · ${editorial.markers.length} 个标记 · ${editorial.notes.length} 条备注。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'OTIO 导入失败。'); }
  };

  const exportMp4 = async () => {
    stopPlayback();
    setExportProgress(0);
    setMessage('正在逐帧渲染 MP4 参考片；将自动选择浏览器可用的最佳编码器…');
    try {
      const result = await exportShotReferenceMp4(shot, { onProgress: setExportProgress });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeFileName(shot.name)}-reference-v${shot.version}.mp4`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`MP4 已完成：${result.frames} 帧${result.missingAudioClipIds.length ? `；${result.missingAudioClipIds.length} 个本地音频缺失，未混入参考片` : '；音频混音已写入'}。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'MP4 导出失败。'); }
    finally { setExportProgress(null); }
  };

  return <div className="timeline-page gate2-timeline">
    <div className="timeline-head editorial-head">
      <span className="chip">剪辑与声音</span>
      <strong>{formatTimecode(currentFrame, shot.fps)}</strong>
      <span>第 {currentFrame} / {maxFrame} 帧 · {shot.fps} 帧/秒 · {time.toFixed(3)} 秒</span>
      <div className="transport-actions">
        <button className="wide compact" onClick={() => stepFrames(-1)} disabled={playing}>◀ 前 1 帧</button>
        <button className="wide compact transport-primary" onClick={() => playing ? stopPlayback() : void startPlayback()}>{playing ? '■ 暂停' : '▶ 播放'}</button>
        <button className="wide compact" onClick={() => stepFrames(1)} disabled={playing}>后 1 帧 ▶</button>
      </div>
    </div>
    <input className="scrubber" type="range" min={0} max={maxFrame} step={1} value={currentFrame} onChange={(e) => { stopPlayback(); setFrame(Number(e.target.value)); }} />

    <div className="editorial-export-bar">
      <button className="wide compact" onClick={exportOtio}>导出 OTIO</button>
      <label className="wide compact file-button">导入 OTIO<input type="file" accept=".otio,.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void importOtio(file); }} /></label>
      <button className="wide compact" onClick={() => void exportMp4()} disabled={exportProgress !== null}>{exportProgress === null ? '导出 MP4 参考片' : `正在编码 ${Math.round(exportProgress * 100)}%`}</button>
      {message && <span className="editorial-message">{message}</span>}
    </div>

    <div className="marker-section">
      <div className="section-title">帧标记 / 导演备注</div>
      <div className="marker-ruler">
        {shot.markers.map((marker) => { const frame = timeToFrame(marker.time, shot.fps); return <button key={marker.id} className={`marker-pin ${marker.color}`} style={{ left: `${frame / maxFrame * 100}%` }} title={`${marker.label} · 第 ${frame} 帧`} onClick={() => setFrame(frame)}>◆</button>; })}
      </div>
      <div className="editorial-entry-row">
        <input value={markerLabel} placeholder={`第 ${currentFrame} 帧添加标记`} onChange={(e) => setMarkerLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && markerLabel.trim()) { addMarker(markerLabel, markerColor); setMarkerLabel(''); } }} />
        <select value={markerColor} onChange={(e) => setMarkerColor(e.target.value as TimelineMarker['color'])}>{markerColors.map((color) => <option value={color} key={color}>{markerColorZh[color]}</option>)}</select>
        <button className="wide compact" onClick={() => { if (markerLabel.trim()) { addMarker(markerLabel, markerColor); setMarkerLabel(''); } }}>+ 标记</button>
        <input value={noteText} placeholder={`第 ${currentFrame} 帧添加导演备注`} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && noteText.trim()) { addNote(noteText); setNoteText(''); } }} />
        <button className="wide compact" onClick={() => { if (noteText.trim()) { addNote(noteText); setNoteText(''); } }}>+ 备注</button>
      </div>
      <div className="marker-note-list">
        {shot.markers.map((marker) => <button key={marker.id} className={`editorial-tag ${marker.color}`} onClick={(event) => event.shiftKey ? removeMarker(marker.id) : setTime(marker.time)} title="点击定位；Shift+点击删除">标记 · 第 {timeToFrame(marker.time, shot.fps)} 帧 · {marker.label}</button>)}
        {shot.notes.map((note) => <button key={note.id} className="editorial-tag note" onClick={(event) => event.shiftKey ? removeNote(note.id) : setTime(note.time)} title="点击定位；Shift+点击删除">备注 · 第 {timeToFrame(note.time, shot.fps)} 帧 · {note.author}：{note.text}</button>)}
      </div>
    </div>

    <div className="track camera-track">
      <b>摄影机</b><div className="clip">{shot.camera.name} · {camera.focalLengthMm.toFixed(0)} 毫米</div>
      {shot.camera.path.map((frame) => <button className="wide" key={`camera-${frame.time}`} title="点击定位；Shift+点击删除" onClick={(event) => event.shiftKey ? removeCameraKeyframe(frame.time) : setTime(frame.time)}>关键帧 {timeToFrame(frame.time, shot.fps)}</button>)}
      <button className="wide" onClick={addCameraKeyframe}>+ 摄影机关键帧 · 第 {currentFrame} 帧</button>
    </div>
    <div className="track camera-track"><b>镜头焦段</b>{lensPresetList.map((lens) => <button className="wide" key={lens.id} title={lens.use} onClick={() => updateCamera('focalLengthMm', lens.focalLengthMm)}>{lens.focalLengthMm} 毫米</button>)}</div>
    <div className="track camera-track"><b>摄影机运动预设</b>{(Object.entries(cameraRigPresets) as [CameraRigPresetId, (typeof cameraRigPresets)[CameraRigPresetId]][]).map(([id, preset]) => <button className="wide" key={id} title={preset.description} onClick={() => applyCameraRigPreset(id)}>{preset.label}</button>)}</div>

    {shot.actors.map((actor) => <div className="track actor-track" key={actor.id}>
      <b>{actor.name}</b><div className="clip">{actionZh[actor.action] ?? actor.action} · {actor.path.length} 个关键帧</div>
      {actor.path.map((frame) => <button className="wide" key={`${actor.id}-${frame.time}`} title="点击定位；Shift+点击删除" onClick={(event) => event.shiftKey ? removeActorKeyframe(actor.id, frame.time) : setTime(frame.time)}>关键帧 {timeToFrame(frame.time, shot.fps)}</button>)}
      <button className="wide" onClick={() => addActorKeyframe(actor.id)}>+ 人物关键帧 · 第 {currentFrame} 帧</button>
    </div>)}

    {shot.lights.map((source) => { const light = sampleLight(source, time); return <div className="track light-track" key={source.id}><b>灯光 · {source.name}</b><div className="clip">强度 {light.intensity.toFixed(2)} · {Math.round(light.colorTemperatureK)}K · {source.path.length} 个关键帧</div>{source.path.map((frame) => <button className="wide" key={`${source.id}-${frame.time}`} title="点击定位；Shift+点击删除" onClick={(event) => event.shiftKey ? removeLightKeyframe(source.id, frame.time) : setTime(frame.time)}>关键帧 {timeToFrame(frame.time, shot.fps)}</button>)}<button className="wide" onClick={() => addLightKeyframe(source.id)}>+ 灯光关键帧 · 第 {currentFrame} 帧</button></div>; })}

    <div className="section-title audio-title">波形音频</div>
    {kinds.map((kind) => <div className="audio-editor-track" key={kind}>
      <div className="audio-track-head"><b>{audioKindZh[kind]}</b><label className="wide compact file-button">+ 导入音频<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void onAudioFile(kind, file); }} /></label><button className="wide compact" onClick={() => addAudioPlaceholder(kind)}>+ 占位片段</button></div>
      {shot.audio.filter((audio) => audio.kind === kind).map((audio) => <div className="audio-clip-card" key={audio.id}>
        <div className="audio-clip-heading"><strong>{audio.name}</strong><span>第 {timeToFrame(audio.start, shot.fps)} → {timeToFrame(audio.start + audio.duration, shot.fps)} 帧</span></div>
        {audio.waveformKey ? <WaveformStrip clipId={audio.id} /> : <div className="waveform missing">占位 / 外部媒体</div>}
        <div className="audio-controls">
          <label>起始帧<input type="number" value={timeToFrame(audio.start, shot.fps)} min={0} max={maxFrame - 1} onChange={(e) => updateAudioClip(audio.id, 'start', frameToTime(Number(e.target.value), shot.fps))} /></label>
          <label>持续帧数<input type="number" value={timeToFrame(audio.duration, shot.fps)} min={1} max={maxFrame} onChange={(e) => updateAudioClip(audio.id, 'duration', frameToTime(Number(e.target.value), shot.fps))} /></label>
          <label>增益 dB<input type="number" value={audio.gainDb} min={-96} max={24} step={0.5} onChange={(e) => updateAudioClip(audio.id, 'gainDb', Number(e.target.value))} /></label>
          <button className="wide compact danger" onClick={() => removeAudioClip(audio.id)} title="仅移出镜头，IndexedDB 媒体缓存保留以支持撤销">移除片段</button>
        </div>
        <div className="meta">{(audio.sourceFileName ?? audio.uri) || '无媒体源'}{audio.sampleRate ? ` · ${audio.sampleRate}Hz · ${audio.channels} 声道` : ''}</div>
      </div>)}
    </div>)}
    <div className="timeline-note">时间基以帧为权威值，秒数仅由“帧 ÷ 帧率”派生。人物、摄影机、灯光、音频、标记、备注、OTIO 与 MP4 共用同一时基；MP4 画面与 2D 构图共用同一导演画面渲染器。</div>
  </div>;
}
