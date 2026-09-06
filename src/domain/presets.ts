import type { DirectorLight } from './model';

export type LightingPresetId = 'neutral' | 'noon' | 'overcast' | 'golden-hour' | 'moonlight' | 'window-drama' | 'horror' | 'interrogation';

const L = (id: string, name: string, type: DirectorLight['type'], x: number, y: number, z: number, intensity: number, kelvin: number, color: string): DirectorLight => ({
  id, name, type, position: { x, y, z }, target: { x: 0, y: 1.2, z: 0 }, intensity, colorTemperatureK: kelvin, color, castShadow: type !== 'ambient',
});

export const lightingPresets: Record<LightingPresetId, { label: string; description: string; lights: DirectorLight[] }> = {
  neutral: { label: '中性棚拍', description: '清楚阅读人物站位的基础教学光。', lights: [L('amb','环境','ambient',0,3,0,0.8,6500,'#ffffff'), L('key','主光','directional',4,7,4,2.2,5600,'#fff4e8')] },
  noon: { label: '正午', description: '高位硬光，阴影短，适合日外。', lights: [L('amb','天光','ambient',0,3,0,0.7,7500,'#dfefff'), L('sun','太阳','directional',2,9,1,3.2,5600,'#fff6df')] },
  overcast: { label: '阴天', description: '低反差、柔和、均匀的环境光。', lights: [L('amb','云层散射','ambient',0,5,0,1.5,7000,'#e7eef4'), L('soft','方向补光','directional',-3,6,4,0.9,6500,'#eaf2ff')] },
  'golden-hour': { label: '黄昏', description: '低角度暖色主光与冷色天空补光。', lights: [L('amb','天空','ambient',0,5,0,0.65,9000,'#bcd4ff'), L('sun','夕阳','directional',-7,2.4,3,4.0,3200,'#ffd0a0')] },
  moonlight: { label: '月夜', description: '低照度冷色侧逆光。', lights: [L('amb','夜空','ambient',0,5,0,0.25,10000,'#5c6f99'), L('moon','月光','directional',-5,6,-4,1.6,11000,'#9db8ff')] },
  'window-drama': { label: '窗光戏剧', description: '单侧大面积窗光，保留面部反差。', lights: [L('amb','室内环境','ambient',0,3,0,0.22,4500,'#81766c'), L('window','窗主光','directional',-6,4,2,3.4,6500,'#e4efff')] },
  horror: { label: '恐怖', description: '低位偏冷主光加微弱环境光，强调非自然阴影。', lights: [L('amb','环境','ambient',0,3,0,0.12,8000,'#38445f'), L('under','低位主光','point',0,0.45,2,18,4300,'#c9d6ff')] },
  interrogation: { label: '审讯室', description: '顶部集中硬光，高反差压迫感。', lights: [L('amb','环境','ambient',0,3,0,0.12,5000,'#777777'), L('top','顶灯','point',0,4.2,0,38,4300,'#fff2d5')] },
};
