import type { DirectorLight } from './model';

export type LightingPresetId = 'neutral' | 'noon' | 'overcast' | 'golden-hour' | 'moonlight' | 'window-drama' | 'horror' | 'interrogation';

const L = (id: string, name: string, type: DirectorLight['type'], x: number, y: number, z: number, intensity: number, kelvin: number, color: string): DirectorLight => ({
  id, name, type, position: { x, y, z }, target: { x: 0, y: 1.2, z: 0 }, intensity, colorTemperatureK: kelvin, color, castShadow: type === 'directional' || type === 'point' || type === 'spot', path: [],
});

/**
 * Lighting presets are intentionally contrast-first: ambient is kept low enough to preserve
 * facial modelling, then key/fill/rim establish readable direction and separation.
 */
export const lightingPresets: Record<LightingPresetId, { label: string; description: string; lights: DirectorLight[] }> = {
  neutral: {
    label: '中性棚拍',
    description: '柔和主光、克制补光和轻微轮廓光，既看清人物又保留面部层次。',
    lights: [
      L('amb', '环境', 'ambient', 0, 3, 0, 0.24, 7200, '#d8e5f4'),
      L('key', '主光', 'area', -3.2, 3.6, 3.5, 6.8, 5200, '#fff1df'),
      L('fill', '补光', 'area', 3.0, 2.35, 2.4, 1.7, 7000, '#dce9ff'),
      L('rim', '轮廓', 'spot', 1.5, 3.1, -3.2, 18, 6500, '#eef5ff'),
    ],
  },
  noon: {
    label: '正午',
    description: '高位硬日光配天空环境和轻微地面回填，避免眼窝完全死黑。',
    lights: [
      L('amb', '天空环境', 'ambient', 0, 4, 0, 0.34, 8000, '#dcecff'),
      L('sun', '太阳', 'directional', 2, 9, 1, 2.9, 5600, '#fff4dc'),
      L('bounce', '地面回填', 'area', 0, 0.65, 2.8, 1.0, 4600, '#ead8c2'),
    ],
  },
  overcast: {
    label: '阴天',
    description: '宽软主光替代过强环境光，保持低反差同时仍能读出脸部方向。',
    lights: [
      L('amb', '云层环境', 'ambient', 0, 5, 0, 0.46, 7600, '#dbe7ef'),
      L('soft', '天空软主光', 'area', -2.8, 5.2, 3.2, 4.6, 6800, '#e6eff7'),
      L('soft-fill', '阴影回填', 'area', 3.2, 2.5, 1.4, 1.15, 7500, '#d8e5ef'),
    ],
  },
  'golden-hour': {
    label: '黄昏',
    description: '低角度暖主光、冷天空补光和柔弱轮廓，维持暖冷色温层次。',
    lights: [
      L('amb', '天空环境', 'ambient', 0, 5, 0, 0.18, 9500, '#aec8ee'),
      L('sun', '夕阳', 'directional', -7, 2.4, 3, 3.6, 3200, '#ffd0a0'),
      L('sky-fill', '天空补光', 'area', 3.4, 3.0, 1.5, 1.35, 8500, '#bfd5ff'),
    ],
  },
  moonlight: {
    label: '月夜',
    description: '低环境底光加冷色侧逆月光，暗部保留信息但不洗平轮廓。',
    lights: [
      L('amb', '夜空环境', 'ambient', 0, 5, 0, 0.09, 11000, '#52698f'),
      L('moon', '月光', 'directional', -5, 6, -4, 1.35, 10500, '#93b3ee'),
      L('moon-rim', '月色轮廓', 'spot', 2.4, 3.1, -3.5, 8.5, 12000, '#8eb4ff'),
    ],
  },
  'window-drama': {
    label: '窗光戏剧',
    description: '大面积侧窗主光与极弱室内环境，保留明显明暗面和眼神光。',
    lights: [
      L('amb', '室内环境', 'ambient', 0, 3, 0, 0.10, 4300, '#746b63'),
      L('window', '窗主光', 'area', -5.5, 3.6, 2.6, 7.2, 6500, '#e5efff'),
      L('room-fill', '室内回填', 'area', 2.8, 1.8, 1.0, 0.75, 3800, '#c9a98c'),
    ],
  },
  horror: {
    label: '恐怖',
    description: '低位主光、冷色后轮廓与极低环境底光，制造不自然阴影但保留主体边界。',
    lights: [
      L('amb', '环境', 'ambient', 0, 3, 0, 0.05, 9000, '#29374f'),
      L('under', '低位主光', 'point', 0, 0.45, 2, 15, 4300, '#c6d4f5'),
      L('back', '冷色后光', 'spot', -1.8, 2.8, -3.0, 10, 10000, '#7698d8'),
    ],
  },
  interrogation: {
    label: '审讯室',
    description: '顶部聚光形成明确光池，微弱环境只用于保留黑位细节。',
    lights: [
      L('amb', '环境', 'ambient', 0, 3, 0, 0.06, 5000, '#777777'),
      L('top', '顶灯', 'spot', 0, 4.2, 0.2, 30, 4300, '#fff0d3'),
    ],
  },
};
