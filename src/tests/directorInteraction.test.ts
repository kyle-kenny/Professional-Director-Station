import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { createActorFromPreset } from '../domain/actorLibrary';
import { createActorMotionPath, motionPresetList } from '../domain/actorMotions';
import { posePresetList, resolvePoseDefinition } from '../domain/poseLibrary';
import { projectSchema } from '../domain/model';

describe('Gate 1 director interaction contracts', () => {
  it('ships a finite director pose library with a safe fallback', () => {
    expect(posePresetList).toHaveLength(8);
    expect(new Set(posePresetList.map((pose) => pose.id)).size).toBe(posePresetList.length);
    for (const pose of posePresetList) {
      expect(pose.action.length).toBeGreaterThan(0);
      for (const rotation of Object.values(pose.jointRotations)) {
        if (!rotation) continue;
        expect(Number.isFinite(rotation.x)).toBe(true);
        expect(Number.isFinite(rotation.y)).toBe(true);
        expect(Number.isFinite(rotation.z)).toBe(true);
      }
    }
    expect(resolvePoseDefinition('unknown-pose').id).toBe('neutral-standing');
  });

  it('creates deterministic actor motion paths in local actor space', () => {
    const actor = createActorFromPreset('man-adult', 1, 0, 0);
    actor.transform.rotation.y = 0;
    const duration = 6;
    for (const preset of motionPresetList) {
      const path = createActorMotionPath(actor, duration, preset.id);
      expect(path).toHaveLength(3);
      expect(path[0].time).toBe(0);
      expect(path.at(-1)?.time).toBe(duration);
      expect(path[0].position).toEqual(actor.transform.position);
    }
    expect(createActorMotionPath(actor, duration, 'walk-forward').at(-1)?.position.z).toBeCloseTo(-2, 6);
    expect(createActorMotionPath(actor, duration, 'retreat').at(-1)?.position.z).toBeCloseTo(1.5, 6);
    expect(createActorMotionPath(actor, duration, 'cross-left').at(-1)?.position.x).toBeCloseTo(-2, 6);
    expect(createActorMotionPath(actor, duration, 'cross-right').at(-1)?.position.x).toBeCloseTo(2, 6);
  });

  it('defaults legacy projects to neutral exposure and rejects unsafe EV ranges', () => {
    const legacy = structuredClone(createDefaultProject()) as ReturnType<typeof createDefaultProject> & { sequences: any[] };
    delete legacy.sequences[0].shots[0].exposureEv;
    const parsed = projectSchema.parse(legacy);
    expect(parsed.sequences[0].shots[0].exposureEv).toBe(0);

    const invalid = structuredClone(createDefaultProject());
    invalid.sequences[0].shots[0].exposureEv = 9;
    expect(() => projectSchema.parse(invalid)).toThrow();
  });
});
