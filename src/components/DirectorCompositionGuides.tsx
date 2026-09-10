import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  compositionGuideDefinitions,
  compositionGuideIds,
  defaultCompositionGuideVisibility,
  type CompositionGuideId,
  type CompositionGuideVisibility,
} from '../domain/compositionGuides';
import { CompositionGuideOverlay } from './CompositionGuideOverlay';

const storageKey = 'pds.director.composition-guides.v1';

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
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const [viewportTarget, setViewportTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const syncTargets = () => {
      setToolbarTarget(document.querySelector<HTMLElement>('.director-console-3d [data-director-guide-toolbar]'));
      setViewportTarget(document.querySelector<HTMLElement>('.director-console-3d .viewport-shell > .viewport'));
    };
    syncTargets();
    const root = document.querySelector('.director-console-3d');
    if (!root) return;
    const observer = new MutationObserver(syncTargets);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(visibility)); } catch { /* storage can be unavailable */ }
  }, [visibility]);

  const toggle = (id: CompositionGuideId) => setVisibility((current) => ({ ...current, [id]: !current[id] }));
  const common = () => setVisibility({ ...defaultCompositionGuideVisibility });
  const hideAll = () => setVisibility(Object.fromEntries(compositionGuideIds.map((id) => [id, false])) as CompositionGuideVisibility);

  const toolbar = toolbarTarget ? createPortal(<>
    <span className="composition-guide-divider" aria-hidden="true" />
    <span>画面构图</span>
    {compositionGuideDefinitions.map((definition) => <button
      key={definition.id}
      type="button"
      className={visibility[definition.id] ? 'active composition-active' : ''}
      aria-pressed={visibility[definition.id]}
      title={definition.title}
      data-composition-toggle={definition.id}
      onClick={() => toggle(definition.id)}
    >{definition.label}</button>)}
    <button type="button" className="utility" onClick={common} data-composition-common>构图常用</button>
    <button type="button" className="utility" onClick={hideAll} data-composition-hide-all>隐藏构图</button>
  </>, toolbarTarget) : null;

  const overlay = toolbarTarget && viewportTarget ? createPortal(<CompositionGuideOverlay visibility={visibility} />, viewportTarget) : null;

  return <>{toolbar}{overlay}</>;
}
