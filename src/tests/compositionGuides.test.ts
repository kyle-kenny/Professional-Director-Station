import { describe, expect, it } from 'vitest';
import {
  compositionGuideDefinitions,
  compositionGuideIds,
  compositionGuideRects,
  compositionGuideSegments,
  defaultCompositionGuideVisibility,
  goldenSectionMajor,
  goldenSectionMinor,
} from '../domain/compositionGuides';

describe('director composition guides', () => {
  it('exposes the full director framing tool set', () => {
    expect(compositionGuideIds).toEqual([
      'thirds',
      'golden-ratio',
      'center-cross',
      'horizon',
      'diagonals',
      'action-safe',
      'title-safe',
    ]);
    expect(compositionGuideDefinitions.map((item) => item.id)).toEqual(compositionGuideIds);
    expect(defaultCompositionGuideVisibility.thirds).toBe(true);
    expect(defaultCompositionGuideVisibility['center-cross']).toBe(true);
    expect(defaultCompositionGuideVisibility['golden-ratio']).toBe(false);
  });

  it('places golden-section lines at mathematically correct 0.382 / 0.618 positions', () => {
    expect(goldenSectionMinor).toBeCloseTo(0.38196601125, 10);
    expect(goldenSectionMajor).toBeCloseTo(0.61803398875, 10);
    const segments = compositionGuideSegments('golden-ratio');
    expect(segments).toHaveLength(4);
    expect(segments[0].x1).toBeCloseTo(38.196601125, 8);
    expect(segments[1].x1).toBeCloseTo(61.803398875, 8);
    expect(segments[2].y1).toBeCloseTo(38.196601125, 8);
    expect(segments[3].y1).toBeCloseTo(61.803398875, 8);
  });

  it('uses conventional 90% action-safe and 80% title-safe frames', () => {
    expect(compositionGuideRects('action-safe')).toEqual([{ x: 5, y: 5, width: 90, height: 90 }]);
    expect(compositionGuideRects('title-safe')).toEqual([{ x: 10, y: 10, width: 80, height: 80 }]);
    expect(compositionGuideSegments('thirds')).toHaveLength(4);
    expect(compositionGuideSegments('diagonals')).toHaveLength(2);
  });
});
