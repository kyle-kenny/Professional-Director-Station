export type LensPresetId = 'ultra-wide-18' | 'wide-24' | 'wide-35' | 'normal-50' | 'portrait-85' | 'tele-135' | 'tele-200' | 'long-300';

export type LensPreset = {
  id: LensPresetId;
  label: string;
  focalLengthMm: number;
  use: string;
};

export const lensPresets: Record<LensPresetId, LensPreset> = {
  'ultra-wide-18': { id: 'ultra-wide-18', label: '18mm 超广角', focalLengthMm: 18, use: '狭小空间、强空间感、建立镜头' },
  'wide-24': { id: 'wide-24', label: '24mm 广角', focalLengthMm: 24, use: '环境叙事、运动跟拍' },
  'wide-35': { id: 'wide-35', label: '35mm 叙事广角', focalLengthMm: 35, use: '人物与环境平衡、双人戏' },
  'normal-50': { id: 'normal-50', label: '50mm 标准', focalLengthMm: 50, use: '自然透视、常规对话' },
  'portrait-85': { id: 'portrait-85', label: '85mm 人像', focalLengthMm: 85, use: '近景、浅景深、人物分离' },
  'tele-135': { id: 'tele-135', label: '135mm 中长焦', focalLengthMm: 135, use: '空间压缩、远距离特写' },
  'tele-200': { id: 'tele-200', label: '200mm 长焦', focalLengthMm: 200, use: '强压缩、远距观察' },
  'long-300': { id: 'long-300', label: '300mm 超长焦', focalLengthMm: 300, use: '极远距离、强烈空间压缩' },
};

export const lensPresetList = Object.values(lensPresets);
