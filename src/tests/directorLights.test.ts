import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { createDirectorLightFromPreset, directorLightToolPresets, directorStageTarget } from '../domain/directorLights';
import { lightSchema } from '../domain/model';

describe('3D 导演台灯光工具', () => {
  const shot = createDefaultProject().sequences[0].shots[0];

  it('提供导演常用的一键灯具架', () => {
    expect(directorLightToolPresets.map((preset) => preset.id)).toEqual([
      'key-area', 'fill-area', 'rim-spot', 'spot', 'point', 'sun', 'ambient',
    ]);
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
