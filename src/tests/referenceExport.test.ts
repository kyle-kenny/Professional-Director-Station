import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { buildReferenceExportPlan } from '../editorial/referenceExportPlan';

describe('Gate 2 reference export plan', () => {
  it('emits exactly one timestamp per output frame', () => {
    const shot = structuredClone(createDefaultProject().sequences[0].shots[0]);
    shot.duration = 2;
    shot.fps = 24;
    const plan = buildReferenceExportPlan(shot);
    expect(plan.frames).toBe(48);
    expect(plan.timestamps).toHaveLength(48);
    expect(plan.timestamps[0]).toBe(0);
    expect(plan.timestamps.at(-1)).toBe(47 / 24);
    expect(plan.duration).toBe(2);
  });
});
