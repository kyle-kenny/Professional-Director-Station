import { describe, expect, it } from 'vitest';
import { actorPresetList, createActorFromPreset } from '../domain/actorLibrary';
import { createActorMotionPath, motionPresetList } from '../domain/actorMotions';
import { lightingPresets } from '../domain/presets';
import { correlatedColorTemperatureToSrgb } from '../utils/lightColor';
import { focalLengthToVerticalFovDeg, projectWorldToFrame } from '../utils/math';
import { createDefaultProject } from '../domain/defaultProject';

describe('release physics integrity', () => {
  it('uses physically consistent filmback focal-length geometry', () => {
    const fov50 = focalLengthToVerticalFovDeg(50, 36, 16 / 9);
    const fov24 = focalLengthToVerticalFovDeg(24, 36, 16 / 9);
    const fov85 = focalLengthToVerticalFovDeg(85, 36, 16 / 9);
    expect(fov50).toBeCloseTo(22.895, 2);
    expect(fov24).toBeGreaterThan(fov50);
    expect(fov85).toBeLessThan(fov50);

    const camera = createDefaultProject().sequences[0].shots[0].camera;
    const center = projectWorldToFrame(camera.target, camera, 16 / 9);
    expect(center.visible).toBe(true);
    expect(center.x).toBeCloseTo(0.5, 5);
    expect(center.y).toBeCloseTo(0.5, 5);
  });

  it('keeps standard cast anthropometry inside plausible blocking bounds', () => {
    for (const preset of actorPresetList) {
      expect(preset.heightM).toBeGreaterThan(1.1);
      expect(preset.heightM).toBeLessThan(2.1);
      expect(preset.eyeHeightM).toBeGreaterThan(preset.heightM * 0.84);
      expect(preset.eyeHeightM).toBeLessThan(preset.heightM);
      expect(preset.shoulderWidthM).toBeGreaterThan(0.25);
      expect(preset.shoulderWidthM).toBeLessThan(0.6);
      expect(preset.bodyDepthM).toBeGreaterThan(0.18);
      expect(preset.bodyDepthM).toBeLessThan(0.4);
      expect(preset.headRadiusM * 2).toBeLessThan(preset.heightM * 0.3);
    }
  });

  it('keeps generated blocking motions on the actor ground plane', () => {
    for (const preset of actorPresetList) {
      const actor = createActorFromPreset(preset.id, 1, 0, 0);
      actor.transform.position.y = 0.25;
      for (const motion of motionPresetList) {
        const keys = createActorMotionPath(actor, 6, motion.id);
        expect(keys.length).toBeGreaterThan(1);
        expect(keys.every((key) => Math.abs(key.position.y - 0.25) < 1e-9)).toBe(true);
      }
    }
  });

  it('uses continuous color-temperature behavior rather than hard warm/cool buckets', () => {
    const warm = correlatedColorTemperatureToSrgb(3200);
    const neutral = correlatedColorTemperatureToSrgb(6500);
    const cool = correlatedColorTemperatureToSrgb(11000);
    expect(warm.r).toBeGreaterThan(warm.b);
    expect(cool.b).toBeGreaterThan(cool.r);
    expect(Math.abs(neutral.r - neutral.b)).toBeLessThan(0.12);
    const a = correlatedColorTemperatureToSrgb(5599);
    const b = correlatedColorTemperatureToSrgb(5601);
    expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)).toBeLessThan(0.01);
  });

  it('never advertises unsupported realtime shadows in built-in light presets', () => {
    for (const preset of Object.values(lightingPresets)) {
      for (const light of preset.lights) {
        if (light.type === 'ambient' || light.type === 'area') expect(light.castShadow).toBe(false);
      }
    }
  });
});
