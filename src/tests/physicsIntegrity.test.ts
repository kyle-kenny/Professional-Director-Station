import { describe, expect, it } from 'vitest';
import { actorPresetList, createActorFromPreset } from '../domain/actorLibrary';
import { createActorMotionPath, motionPresetList } from '../domain/actorMotions';
import { lightingPresets } from '../domain/presets';
import { correlatedColorTemperatureToSrgb } from '../utils/lightColor';
import { cameraDepthOfField, cameraGroundFrustum, fitAspectRect, focalLengthToHorizontalFovDeg, focalLengthToVerticalFovDeg, projectWorldToFrame } from '../utils/math';
import { createDefaultProject } from '../domain/defaultProject';
import { projectSchema } from '../domain/model';

describe('release physics integrity', () => {
  it('uses physically consistent filmback focal-length geometry', () => {
    const fov50 = focalLengthToVerticalFovDeg(50, 36, 16 / 9);
    const fov24 = focalLengthToVerticalFovDeg(24, 36, 16 / 9);
    const fov85 = focalLengthToVerticalFovDeg(85, 36, 16 / 9);
    expect(fov50).toBeCloseTo(22.895, 2);
    expect(fov24).toBeGreaterThan(fov50);
    expect(fov85).toBeLessThan(fov50);
    expect(focalLengthToHorizontalFovDeg(50, 36)).toBeCloseTo(39.598, 2);

    const camera = createDefaultProject().sequences[0].shots[0].camera;
    const center = projectWorldToFrame(camera.target, camera, 16 / 9);
    expect(center.visible).toBe(true);
    expect(center.x).toBeCloseTo(0.5, 5);
    expect(center.y).toBeCloseTo(0.5, 5);
  });

  it('computes physically plausible depth of field from filmback, focal length, aperture and focus distance', () => {
    const depth = cameraDepthOfField({ focalLengthMm: 50, sensorWidthMm: 36, aperture: 2.8, focusDistanceM: 3 }, 16 / 9);
    expect(depth.validFocus).toBe(true);
    expect(depth.sensorHeightMm).toBeCloseTo(20.25, 5);
    expect(depth.circleOfConfusionMm).toBeCloseTo(0.02754, 4);
    expect(depth.hyperfocalM).toBeCloseTo(32.47, 1);
    expect(depth.nearM).toBeCloseTo(2.75, 2);
    expect(depth.farM).toBeCloseTo(3.30, 2);
  });

  it('widens depth of field when stopping down and reaches infinity beyond the hyperfocal threshold', () => {
    const shallow = cameraDepthOfField({ focalLengthMm: 50, sensorWidthMm: 36, aperture: 1.4, focusDistanceM: 3 }, 16 / 9);
    const stoppedDown = cameraDepthOfField({ focalLengthMm: 50, sensorWidthMm: 36, aperture: 8, focusDistanceM: 3 }, 16 / 9);
    expect(stoppedDown.nearM).toBeLessThan(shallow.nearM);
    expect(stoppedDown.farM).toBeGreaterThan(shallow.farM);
    const hyperfocalFocus = cameraDepthOfField({ focalLengthMm: 50, sensorWidthMm: 36, aperture: 8, focusDistanceM: stoppedDown.hyperfocalM }, 16 / 9);
    expect(hyperfocalFocus.farM).toBe(Number.POSITIVE_INFINITY);
  });

  it('keeps shot framing stable when the UI container aspect changes', () => {
    const wide = fitAspectRect(1600, 700, 16 / 9);
    expect(wide.height).toBe(700);
    expect(wide.width / wide.height).toBeCloseTo(16 / 9, 8);
    expect(wide.x).toBeGreaterThan(0);
    const tall = fitAspectRect(700, 1200, 16 / 9);
    expect(tall.width).toBe(700);
    expect(tall.width / tall.height).toBeCloseTo(16 / 9, 8);
    expect(tall.y).toBeGreaterThan(0);

    const project = createDefaultProject();
    const legacy: any = structuredClone(project);
    delete legacy.sequences[0].shots[0].frameAspect;
    expect(projectSchema.parse(legacy).sequences[0].shots[0].frameAspect).toBeCloseTo(16 / 9, 8);
  });

  it('derives floor-plan frustum width from real focal length and sensor width', () => {
    const camera = createDefaultProject().sequences[0].shots[0].camera;
    const wideCamera = { ...camera, focalLengthMm: 18 };
    const teleCamera = { ...camera, focalLengthMm: 200 };
    const wide = cameraGroundFrustum(wideCamera, 6);
    const tele = cameraGroundFrustum(teleCamera, 6);
    expect(wide.horizontalFovDeg).toBeGreaterThan(tele.horizontalFovDeg);
    expect(Math.hypot(wide.left.x - wide.right.x, wide.left.z - wide.right.z)).toBeGreaterThan(Math.hypot(tele.left.x - tele.right.x, tele.left.z - tele.right.z));
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
