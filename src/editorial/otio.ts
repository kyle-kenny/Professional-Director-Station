import type { AudioClip, Shot, ShotNote, TimelineMarker } from '../domain/model';
import { frameToTime, timeToFrame } from './timelineEngine';

const schema = (name: string, version: number) => `${name}.${version}`;
const rationalTime = (frame: number, fps: number) => ({ OTIO_SCHEMA: schema('RationalTime', 1), value: frame, rate: fps });
const timeRange = (startFrame: number, durationFrames: number, fps: number) => ({
  OTIO_SCHEMA: schema('TimeRange', 1),
  start_time: rationalTime(startFrame, fps),
  duration: rationalTime(durationFrames, fps),
});

export type OtioEditorialImport = {
  audio: AudioClip[];
  markers: TimelineMarker[];
  notes: ShotNote[];
};

function markerToOtio(marker: TimelineMarker, fps: number) {
  return {
    OTIO_SCHEMA: schema('Marker', 2),
    name: marker.label,
    color: marker.color.toUpperCase(),
    marked_range: timeRange(timeToFrame(marker.time, fps), 0, fps),
    metadata: { pds: { type: 'marker', id: marker.id, color: marker.color } },
  };
}

function noteToOtio(note: ShotNote, fps: number) {
  return {
    OTIO_SCHEMA: schema('Marker', 2),
    name: `NOTE · ${note.author}`,
    comment: note.text,
    color: 'VIOLET',
    marked_range: timeRange(timeToFrame(note.time, fps), 0, fps),
    metadata: { pds: { type: 'note', id: note.id, author: note.author, text: note.text } },
  };
}

export function shotToOtioObject(shot: Shot) {
  const fps = shot.fps;
  const durationFrames = timeToFrame(shot.duration, fps);
  const videoClip = {
    OTIO_SCHEMA: schema('Clip', 2),
    name: shot.name,
    source_range: timeRange(0, durationFrames, fps),
    media_reference: { OTIO_SCHEMA: schema('MissingReference', 1), name: 'PDS director structural reference', metadata: {} },
    markers: [...shot.markers.map((item) => markerToOtio(item, fps)), ...shot.notes.map((item) => noteToOtio(item, fps))],
    metadata: { pds: { shotId: shot.id, shotVersion: shot.version, fps } },
  };

  const audioTracks = shot.audio.map((clip, index) => {
    const startFrame = timeToFrame(clip.start, fps);
    const clipFrames = Math.max(1, timeToFrame(clip.duration, fps));
    const children: unknown[] = [];
    if (startFrame > 0) children.push({ OTIO_SCHEMA: schema('Gap', 1), name: 'PDS placement gap', source_range: timeRange(0, startFrame, fps), metadata: {} });
    children.push({
      OTIO_SCHEMA: schema('Clip', 2),
      name: clip.name,
      source_range: timeRange(0, clipFrames, fps),
      media_reference: clip.uri
        ? { OTIO_SCHEMA: schema('ExternalReference', 1), target_url: clip.uri, available_range: null, metadata: {} }
        : { OTIO_SCHEMA: schema('MissingReference', 1), name: clip.sourceFileName ?? clip.name, metadata: { pdsLocalMedia: true } },
      markers: [],
      metadata: {
        pds: {
          type: 'audio', id: clip.id, kind: clip.kind, gainDb: clip.gainDb,
          startFrame, durationFrames: clipFrames, sourceFileName: clip.sourceFileName, waveformKey: clip.waveformKey,
        },
      },
    });
    return {
      OTIO_SCHEMA: schema('Track', 1),
      name: `${clip.kind.toUpperCase()} ${index + 1} · ${clip.name}`,
      kind: 'Audio',
      children,
      markers: [],
      metadata: { pds: { kind: clip.kind, clipId: clip.id } },
    };
  });

  return {
    OTIO_SCHEMA: schema('Timeline', 1),
    name: `${shot.name} · PDS Editorial`,
    global_start_time: rationalTime(0, fps),
    tracks: {
      OTIO_SCHEMA: schema('Stack', 1),
      name: 'PDS Tracks',
      children: [
        { OTIO_SCHEMA: schema('Track', 1), name: 'VIDEO · Director Reference', kind: 'Video', children: [videoClip], markers: [], metadata: { pds: { type: 'director-reference' } } },
        ...audioTracks,
      ],
      markers: [],
      metadata: { pds: { fps, shotId: shot.id } },
    },
    metadata: { pds: { schema: 'pds-otio-1', shotId: shot.id, fps } },
  };
}

export function exportShotToOtio(shot: Shot): string {
  return JSON.stringify(shotToOtioObject(shot), null, 2);
}

function readFrame(value: any, fallbackFps: number): number {
  const raw = Number(value?.value ?? 0);
  const rate = Number(value?.rate ?? fallbackFps) || fallbackFps;
  return Math.round(raw * fallbackFps / rate);
}

export function parseOtioEditorial(json: string, fps: number): OtioEditorialImport {
  const root = JSON.parse(json) as any;
  if (!String(root?.OTIO_SCHEMA ?? '').startsWith('Timeline.')) throw new Error('OTIO 根对象必须是 Timeline。');
  const tracks: any[] = Array.isArray(root?.tracks?.children) ? root.tracks.children : [];
  const audio: AudioClip[] = [];
  const markers: TimelineMarker[] = [];
  const notes: ShotNote[] = [];

  for (const track of tracks) {
    const children: any[] = Array.isArray(track?.children) ? track.children : [];
    for (const child of children) {
      if (String(child?.OTIO_SCHEMA ?? '').startsWith('Clip.') && Array.isArray(child?.markers)) {
        for (const marker of child.markers) {
          const frame = readFrame(marker?.marked_range?.start_time, fps);
          const pds = marker?.metadata?.pds ?? {};
          if (pds.type === 'note') {
            notes.push({ id: String(pds.id ?? `note-${frame}-${notes.length + 1}`), author: String(pds.author ?? 'OTIO'), time: frameToTime(frame, fps), text: String(pds.text ?? marker.comment ?? marker.name ?? 'Note') });
          } else {
            const rawColor = String(pds.color ?? marker.color ?? 'amber').toLowerCase();
            const color = ['blue', 'amber', 'red', 'green', 'violet'].includes(rawColor) ? rawColor as TimelineMarker['color'] : 'amber';
            markers.push({ id: String(pds.id ?? `marker-${frame}-${markers.length + 1}`), time: frameToTime(frame, fps), label: String(marker.name ?? 'Marker'), color });
          }
        }
      }

      const pds = child?.metadata?.pds;
      if (!pds || pds.type !== 'audio') continue;
      const startFrame = Number.isFinite(Number(pds.startFrame)) ? Math.round(Number(pds.startFrame)) : 0;
      const durationFrames = Math.max(1, Number.isFinite(Number(pds.durationFrames)) ? Math.round(Number(pds.durationFrames)) : readFrame(child?.source_range?.duration, fps));
      const kind = ['dialogue', 'music', 'sfx', 'ambience'].includes(String(pds.kind)) ? pds.kind as AudioClip['kind'] : 'dialogue';
      audio.push({
        id: String(pds.id ?? `otio-audio-${audio.length + 1}`),
        name: String(child.name ?? 'OTIO Audio'),
        kind,
        start: frameToTime(startFrame, fps),
        duration: frameToTime(durationFrames, fps),
        gainDb: Number.isFinite(Number(pds.gainDb)) ? Number(pds.gainDb) : 0,
        uri: String(child?.media_reference?.target_url ?? ''),
        sourceFileName: pds.sourceFileName ? String(pds.sourceFileName) : undefined,
        waveformKey: pds.waveformKey ? String(pds.waveformKey) : undefined,
      });
    }
  }
  return { audio, markers, notes };
}
