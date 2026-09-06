import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { frameFromElapsed, frameToTime, sampleShotAtFrame, snapTimeToFrame, stepFrame, timeToFrame, totalFrames } from '../editorial/timelineEngine';

describe('Gate 2 deterministic timeline engine', () => {
  it('uses integer frames as the authoritative timebase', () => {
    expect(timeToFrame(1, 24)).toBe(24);
    expect(frameToTime(25, 25)).toBe(1);
    expect(snapTimeToFrame(1.021, 10, 24)).toBe(25 / 24);
    expect(totalFrames(10, 24)).toBe(240);
  });

  it('clamps stepping and elapsed transport deterministically', () => {
    expect(stepFrame(0, -1, 2, 24)).toBe(0);
    expect(stepFrame(47, 2, 2, 24)).toBe(48);
    expect(frameFromElapsed(10, 1000, 10, 24)).toBe(34);
    expect(frameFromElapsed(230, 1000, 10, 24)).toBe(240);
  });

  it('samples all director systems at the exact same frame', () => {
    const shot = createDefaultProject().sequences[0].shots[0];
    shot.markers = [{ id: 'm1', time: 1 / shot.fps, label: 'Beat', color: 'amber' }];
    shot.notes = [{ id: 'n1', time: 1 / shot.fps, author: 'Director', text: 'Hold' }];
    const sampled = sampleShotAtFrame(shot, 1);
    expect(sampled.frame).toBe(1);
    expect(sampled.time).toBe(1 / shot.fps);
    expect(sampled.camera.position).toBeDefined();
    expect(sampled.actors).toHaveLength(shot.actors.length);
    expect(sampled.lights).toHaveLength(shot.lights.length);
    expect(sampled.markers.map((item) => item.id)).toEqual(['m1']);
    expect(sampled.notes.map((item) => item.id)).toEqual(['n1']);
  });
});
