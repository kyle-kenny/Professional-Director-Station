import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { projectSchema } from '../domain/model';

describe('Gate 2 schema compatibility', () => {
  it('adds empty marker lanes to legacy project JSON', () => {
    const legacy: any = structuredClone(createDefaultProject());
    for (const sequence of legacy.sequences) for (const shot of sequence.shots) delete shot.markers;
    const parsed = projectSchema.parse(legacy);
    expect(parsed.sequences[0].shots[0].markers).toEqual([]);
  });

  it('accepts legacy audio clips while preserving new metadata when present', () => {
    const legacy: any = structuredClone(createDefaultProject());
    legacy.sequences[0].shots[0].audio = [{ id: 'old-audio', name: 'Old', kind: 'dialogue', start: 0, duration: 1, gainDb: 0, uri: '' }];
    const parsed = projectSchema.parse(legacy);
    expect(parsed.sequences[0].shots[0].audio[0]).toMatchObject({ id: 'old-audio', kind: 'dialogue' });
  });
});
