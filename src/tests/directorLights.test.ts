import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { createDirectorLightFromPreset, directorLightDirectionPresets, directorLightToolPresets, directorStageTarget, placeDirectorLightAtDirection } from '../domain/directorLights';
import { lightSchema } from '../domain/model';

describe('3D 导演台灯光工具', () => {
  const shot = createDefaultProject().sequences[0].shots[0];

  it('提供导演常用的一键灯具架', () => {
    expect(directorLightToolPresets.map((preset) => preset.id)).toEqual([
      'key-area', 'fill-area', 'rim-spot', 'spot', 'point', 'sun', 'ambient',
    ]);
  });

  it('提供左上右前下后六个快速打光方向', () => {
    expect(directorLightDirectionPresets.map((preset) => preset.id)).toEqual(['left', 'top', 'right', 'front', 'bottom', 'back']);
  });

  it('主光按摄影机关系自动摆在人物附近并瞄准舞台中心', () => {
    const target = directorStageTarget(shot, 0);
    const light = createDirectorLightFromPreset(shot, 0, 'key-area', 1, 'test-key');
    expect(lightSchema.parse(light)).toEqual(light);
    expect(light.type).toBe('area');
    expect(light.name).toBe('主光 1');
    expect(light.target).toEqual(target);
    expect(light.position.y).toBeGreaterThan(target.y);
    expect(light.castShadow).toBe(false);
  });

  it('六方向重定位不修改原灯并持续瞄准人物舞台中心', () => {
    const original = createDirectorLightFromPreset(shot, 0, 'spot', 1, 'test-spot');
    const originalPosition = structuredClone(original.position);
    const target = directorStageTarget(shot, 0);
    for (const direction of directorLightDirectionPresets) {
      const positioned = placeDirectorLightAtDirection(shot, 0, original, direction.id);
      expect(lightSchema.parse(positioned)).toEqual(positioned);
      expect(positioned.target).toEqual(target);
      expect(positioned.position).not.toEqual(originalPosition);
    }
    expect(original.position).toEqual(originalPosition);
  });

  it('轮廓光使用可投影聚光灯，环境光不伪造方向目标', () => {
    const rim = createDirectorLightFromPreset(shot, 0, 'rim-spot', 1, 'test-rim');
    const ambient = createDirectorLightFromPreset(shot, 0, 'ambient', 1, 'test-ambient');
    expect(rim.type).toBe('spot');
    expect(rim.castShadow).toBe(true);
    expect(rim.target).toBeDefined();
    expect(ambient.type).toBe('ambient');
    expect(ambient.target).toBeUndefined();
    expect(ambient.castShadow).toBe(false);
  });

  it('所有快速灯具都满足工程 Light Schema', () => {
    for (const [index, preset] of directorLightToolPresets.entries()) {
      expect(() => lightSchema.parse(createDirectorLightFromPreset(shot, 0, preset.id, index + 1, `test-${preset.id}`))).not.toThrow();
    }
  });
});
