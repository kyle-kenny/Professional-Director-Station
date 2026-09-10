import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../domain/defaultProject';
import { buildDirectorStructureGuides, defaultDirectorGuideVisibility, directorGuideDefinitions, directorGuideIds } from '../engine/directorGuides';

describe('导演视图辅助线', () => {
  const shot = createDefaultProject().sequences[0].shots[0];

  it('提供导演常用的八类结构辅助', () => {
    expect(directorGuideIds).toEqual([
      'grid', 'world-axes', 'camera-frustum', 'camera-axis', 'actor-height', 'axis-180', 'look-lines', 'motion-paths',
    ]);
    expect(directorGuideDefinitions.map((item) => item.id)).toEqual([...directorGuideIds]);
  });

  it('摄影机视锥可以独立隐藏，常用结构线默认开启', () => {
    expect(defaultDirectorGuideVisibility['camera-frustum']).toBe(true);
    expect(defaultDirectorGuideVisibility['camera-axis']).toBe(true);
    expect(defaultDirectorGuideVisibility['axis-180']).toBe(true);
    expect(defaultDirectorGuideVisibility['world-axes']).toBe(false);
  });

  it('双人默认镜头可生成摄影轴、人物高度、180 度轴和视线结构', () => {
    const guides = buildDirectorStructureGuides(shot, 0);
    expect(guides.get('camera-axis')?.children.length).toBe(1);
    expect(guides.get('actor-height')?.children.length).toBe(shot.actors.length * 2);
    expect(guides.get('axis-180')?.children.length).toBe(1);
    expect(guides.get('look-lines')?.children.length).toBe(shot.actors.length);
  });
});
