import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { exportShotToOtio, parseOtioEditorial } from '../editorial/otio';

describe('Gate 2 OTIO interchange', () => {
  it('round-trips frame-accurate audio, markers and notes', () => {
    const shot = structuredClone(createDefaultProject().sequences[0].shots[0]);
    const fps = shot.fps;
    shot.audio = [{
      id: 'dialogue-1', name: 'Dialogue A', kind: 'dialogue', start: 12 / fps, duration: 48 / fps,
      gainDb: -3, uri: 'file:///dialogue.wav', sourceFileName: 'dialogue.wav', waveformKey: 'dialogue-1',
    }];
    shot.markers = [{ id: 'marker-1', time: 24 / fps, label: 'Turn', color: 'blue' }];
    shot.notes = [{ id: 'note-1', time: 36 / fps, author: 'Director', text: 'Hold eyeline' }];

    const json = exportShotToOtio(shot);
    const parsed = parseOtioEditorial(json, fps);
    expect(parsed.audio).toHaveLength(1);
    expect(parsed.audio[0]).toMatchObject({ id: 'dialogue-1', kind: 'dialogue', start: 12 / fps, duration: 48 / fps, gainDb: -3 });
    expect(parsed.markers).toEqual(shot.markers);
    expect(parsed.notes).toEqual(shot.notes);
  });

  it('rejects non-Timeline JSON', () => {
    expect(() => parseOtioEditorial('{"OTIO_SCHEMA":"Clip.2"}', 24)).toThrow(/Timeline/);
  });
});
