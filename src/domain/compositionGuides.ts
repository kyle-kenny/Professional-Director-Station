export const compositionGuideIds = [
  'thirds',
  'golden-ratio',
  'center-cross',
  'horizon',
  'diagonals',
  'action-safe',
  'title-safe',
] as const;

export type CompositionGuideId = (typeof compositionGuideIds)[number];
export type CompositionGuideVisibility = Record<CompositionGuideId, boolean>;

export type CompositionGuideDefinition = {
  id: CompositionGuideId;
  label: string;
  title: string;
};

export const compositionGuideDefinitions: CompositionGuideDefinition[] = [
  { id: 'thirds', label: '三分法', title: '九宫格 / 三分法构图线' },
  { id: 'golden-ratio', label: '黄金分割', title: '0.382 / 0.618 黄金分割构图线' },
  { id: 'center-cross', label: '中心十字', title: '画面几何中心十字' },
  { id: 'horizon', label: '地平线', title: '画面水平中线，用于检查地平与倾斜' },
  { id: 'diagonals', label: '对角线', title: '画面对角构图参考线' },
  { id: 'action-safe', label: '动作安全框', title: '约 90% 动作安全区域' },
  { id: 'title-safe', label: '字幕安全框', title: '约 80% 字幕 / 关键信息安全区域' },
];

export const defaultCompositionGuideVisibility: CompositionGuideVisibility = {
  thirds: true,
  'golden-ratio': false,
  'center-cross': true,
  horizon: false,
  diagonals: false,
  'action-safe': false,
  'title-safe': false,
};

export type CompositionGuideSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type CompositionGuideRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const goldenSectionMinor = (3 - Math.sqrt(5)) / 2;
export const goldenSectionMajor = 1 - goldenSectionMinor;

function fullVertical(x: number): CompositionGuideSegment {
  return { x1: x, y1: 0, x2: x, y2: 100 };
}

function fullHorizontal(y: number): CompositionGuideSegment {
  return { x1: 0, y1: y, x2: 100, y2: y };
}

export function compositionGuideSegments(id: CompositionGuideId): CompositionGuideSegment[] {
  switch (id) {
    case 'thirds':
      return [fullVertical(100 / 3), fullVertical(200 / 3), fullHorizontal(100 / 3), fullHorizontal(200 / 3)];
    case 'golden-ratio': {
      const minor = goldenSectionMinor * 100;
      const major = goldenSectionMajor * 100;
      return [fullVertical(minor), fullVertical(major), fullHorizontal(minor), fullHorizontal(major)];
    }
    case 'center-cross':
      return [
        { x1: 46, y1: 50, x2: 54, y2: 50 },
        { x1: 50, y1: 46, x2: 50, y2: 54 },
      ];
    case 'horizon':
      return [fullHorizontal(50)];
    case 'diagonals':
      return [
        { x1: 0, y1: 0, x2: 100, y2: 100 },
        { x1: 100, y1: 0, x2: 0, y2: 100 },
      ];
    default:
      return [];
  }
}

export function compositionGuideRects(id: CompositionGuideId): CompositionGuideRect[] {
  if (id === 'action-safe') return [{ x: 5, y: 5, width: 90, height: 90 }];
  if (id === 'title-safe') return [{ x: 10, y: 10, width: 80, height: 80 }];
  return [];
}
