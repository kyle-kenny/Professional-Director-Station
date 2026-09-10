import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  compositionGuideDefinitions,
  compositionGuideIds,
  defaultCompositionGuideVisibility,
  type CompositionGuideId,
  type CompositionGuideVisibility,
} from '../domain/compositionGuides';
import { useDirectorStore } from '../store/directorStore';
import { fitAspectRect } from '../utils/math';
import { CompositionGuideOverlay } from './CompositionGuideOverlay';
import { ShotViewActorMover } from './ShotViewActorMover';

const storageKey = 'pds.director.composition-guides.v1';

type FrameRect = { x: number; y: number; width: number; height: number };

function readVisibility(): CompositionGuideVisibility {
  if (typeof window === 'undefined') return { ...defaultCompositionGuideVisibility };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Partial<CompositionGuideVisibility>;
    return Object.fromEntries(compositionGuideIds.map((id) => [id, typeof parsed[id] === 'boolean' ? parsed[id] : defaultCompositionGuideVisibility[id]])) as CompositionGuideVisibility;
  } catch {
    return { ...defaultCompositionGuideVisibility };
  }
}

export function DirectorCompositionGuides() {
  const [visibility, setVisibility] = useState<CompositionGuideVisibility>(readVisibility);
  const [viewportShell, setViewportShell] = useState<HTMLElement | null>(null);
  const [viewportTarget, setViewportTarget] = useState<HTMLElement | null>(null);
  const [shotViewActive, setShotViewActive] = useState(false);
  const [frameRect, setFrameRect] = useState<FrameRect | null>(null);
  const shot = useDirectorStore((state) => state.getActiveShot());
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const selectedIsActor = shot.actors.some((actor) => actor.id === selectedObjectId);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.director-console-3d');
    if (!root) return;
    const syncTargets = () => {
      const shell = root.querySelector<HTMLElement>('.viewport-shell');
      const viewport = root.querySelector<HTMLElement>('.viewport-shell > .viewport');
      const shotButton = Array.from(root.querySelectorAll<HTMLButtonElement>('.viewport-toolbar button'))
        .find((button) => button.textContent?.trim() === '镜头视图');
      setViewportShell(shell);
      setViewportTarget(viewport);
      setShotViewActive(Boolean(shotButton?.classList.contains('active')));
    };
    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!viewportTarget) { setFrameRect(null); return; }
    const updateFrame = () => {
      const width = viewportTarget.clientWidth;
      const height = viewportTarget.clientHeight;
      if (width <= 0 || height <= 0) { setFrameRect(null); return; }
      setFrameRect(fitAspectRect(width, height, shot.frameAspect));
    };
    updateFrame();
    const observer = new ResizeObserver(updateFrame);
    observer.observe(viewportTarget);
    return () => observer.disconnect();
  }, [shot.frameAspect, viewportTarget]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(visibility)); } catch { /* storage can be unavailable */ }
  }, [visibility]);

  const toggle = (id: CompositionGuideId) => setVisibility((current) => ({ ...current, [id]: !current[id] }));
  const common = () => setVisibility({ ...defaultCompositionGuideVisibility });
  const hideAll = () => setVisibility(Object.fromEntries(compositionGuideIds.map((id) => [id, false])) as CompositionGuideVisibility);

  const toolbar = shotViewActive && viewportShell ? createPortal(<div
    className="director-guide-toolbar shot-composition-toolbar"
    aria-label="镜头构图辅助线工具栏"
    data-shot-composition-toolbar
  >
    <span>镜头构图</span>
    {compositionGuideDefinitions.map((definition) => <button
      key={definition.id}
      type="button"
      className={visibility[definition.id] ? 'active composition-active' : ''}
      aria-pressed={visibility[definition.id]}
      title={definition.title}
      data-composition-toggle={definition.id}
      onClick={() => toggle(definition.id)}
    >{definition.label}</button>)}
    <span className="guide-spacer" />
    <button type="button" className="utility" onClick={common} data-composition-common>构图常用</button>
    <button type="button" className="utility" onClick={hideAll} data-composition-hide-all>隐藏构图</button>
    <span className={selectedIsActor ? 'shot-actor-move-hint active' : 'shot-actor-move-hint'} data-shot-actor-move-hint>
      {selectedIsActor ? '人物平移：直接拖动人物（贴地）' : '人物平移：先在镜头中点选人物，再拖动'}
    </span>
  </div>, viewportShell) : null;

  const overlay = shotViewActive && viewportTarget && frameRect ? createPortal(<div
    className="shot-composition-frame"
    data-composition-frame
    style={{ left: frameRect.x, top: frameRect.y, width: frameRect.width, height: frameRect.height }}
  >
    <CompositionGuideOverlay visibility={visibility} />
  </div>, viewportTarget) : null;

  return <><ShotViewActorMover />{toolbar}{overlay}</>;
}
