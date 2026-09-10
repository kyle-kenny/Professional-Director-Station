import { describe, expect, it } from 'vitest';
import { directorLightToolPresets } from '../domain/directorLights';
import { lightingPresets } from '../domain/presets';
import { lightSchema } from '../domain/model';

describe('导演灯光层次', () => {
  it('中性棚拍使用低环境底光加主补轮廓，而不是高环境光洗平人物', () => {
    const neutral = lightingPresets.neutral.lights;
    const ambient = neutral.find((light) => light.type === 'ambient');
    const key = neutral.find((light) => light.id === 'key');
    const fill = neutral.find((light) => light.id === 'fill');
    const rim = neutral.find((light) => light.id === 'rim');
    expect(ambient?.intensity).toBeLessThan(0.4);
    expect(key?.type).toBe('area');
    expect(fill?.type).toBe('area');
    expect((key?.intensity ?? 0) / Math.max(0.001, fill?.intensity ?? 1)).toBeGreaterThan(3);
    expect(rim?.type).toBe('spot');
  });

  it('快速主光与补光保留明显照度比，环境光保持最低照度角色', () => {
    const key = directorLightToolPresets.find((preset) => preset.id === 'key-area')!;
    const fill = directorLightToolPresets.find((preset) => preset.id === 'fill-area')!;
    const ambient = directorLightToolPresets.find((preset) => preset.id === 'ambient')!;
    expect(key.intensity / fill.intensity).toBeGreaterThanOrEqual(4);
    expect(ambient.intensity).toBeLessThan(0.25);
    expect(fill.colorTemperatureK).toBeGreaterThan(key.colorTemperatureK);
  });

  it('所有电影化灯光预设仍满足工程 Light Schema', () => {
    for (const preset of Object.values(lightingPresets)) {
      for (const light of preset.lights) expect(() => lightSchema.parse(light)).not.toThrow();
    }
  });
});
