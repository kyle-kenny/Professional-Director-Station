import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DirectorProject } from '../domain/model';
import { cameraArrowTranslation, cameraPanFromPointerDelta, previewCameraPose, type CameraPose } from '../domain/cameraNavigation';
import { setCameraEntityPose } from '../store/sceneObjectRegistry';
import { useDirectorStore } from '../store/directorStore';
import { sampleCamera } from '../utils/animation';
import { focalLengthToVerticalFovDeg } from '../utils/math';

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  viewportHeight: number;
  sequenceId: string;
  shotId: string;
  playhead: number;
  baseProject: DirectorProject;
  baseUndo: DirectorProject[];
  baseRedo: DirectorProject[];
  camera: ReturnType<typeof sampleCamera>;
  verticalFovDeg: number;
  finalPose: CameraPose;
};

function isShotViewActive() {
  const buttons = document.querySelectorAll('.director-console-3d .viewport-toolbar button.active');
  return Array.from(buttons).some((button) => button.textContent?.trim() === '镜头视图');
}

function inputIsEditing(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName ?? ''));
}

export function ShotCameraNavigator() {
  const dragRef = useRef<DragSession | null>(null);
  const [shotView, setShotView] = useState(false);
  const [consoleTarget, setConsoleTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const consoleElement = document.querySelector('.director-console-3d') as HTMLElement | null;
    const toolbar = document.querySelector('.director-console-3d .viewport-toolbar');
    setConsoleTarget(consoleElement);
    const update = () => setShotView(isShotViewActive());
    update();
    const observer = new MutationObserver(update);
    if (toolbar) observer.observe(toolbar, { attributes: true, subtree: true, attributeFilter: ['class'] });
    document.addEventListener('click', update, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', update, true);
    };
  }, []);

  useEffect(() => {
    const viewport = document.querySelector('.director-console-3d .viewport') as HTMLElement | null;
    if (!viewport) return;

    const restoreBase = (session: DragSession) => {
      useDirectorStore.setState({
        project: structuredClone(session.baseProject),
        undoStack: session.baseUndo,
        redoStack: session.baseRedo,
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2 || !isShotViewActive() || inputIsEditing(event.target)) return;
      const state = useDirectorStore.getState();
      const shot = state.getActiveShot();
      if (shot.status === 'APPROVED') return;
      const camera = sampleCamera(shot.camera, state.playhead);
      const rect = viewport.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewportHeight: Math.max(1, rect.height),
        sequenceId: state.activeSequenceId,
        shotId: state.activeShotId,
        playhead: state.playhead,
        baseProject: structuredClone(state.project),
        baseUndo: state.undoStack,
        baseRedo: state.redoStack,
        camera,
        verticalFovDeg: focalLengthToVerticalFovDeg(camera.focalLengthMm, camera.sensorWidthMm, shot.frameAspect),
        finalPose: { position: { ...camera.position }, target: { ...camera.target } },
      };
      viewport.setPointerCapture(event.pointerId);
      viewport.style.cursor = 'grabbing';
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const pose = cameraPanFromPointerDelta(
        session.camera,
        event.clientX - session.startX,
        event.clientY - session.startY,
        session.viewportHeight,
        session.verticalFovDeg,
      );
      session.finalPose = pose;
      useDirectorStore.setState({
        project: previewCameraPose(session.baseProject, session.sequenceId, session.shotId, session.playhead, pose),
        undoStack: session.baseUndo,
        redoStack: session.baseRedo,
      });
      event.preventDefault();
      event.stopPropagation();
    };

    const finishDrag = (event: PointerEvent, commit: boolean) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      dragRef.current = null;
      viewport.style.cursor = '';
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      restoreBase(session);
      if (commit) setCameraEntityPose(session.finalPose.position, session.finalPose.target);
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerUp = (event: PointerEvent) => finishDrag(event, true);
    const onPointerCancel = (event: PointerEvent) => finishDrag(event, false);
    const onContextMenu = (event: MouseEvent) => {
      if (!isShotViewActive()) return;
      event.preventDefault();
    };

    viewport.addEventListener('pointerdown', onPointerDown, true);
    viewport.addEventListener('pointermove', onPointerMove, true);
    viewport.addEventListener('pointerup', onPointerUp, true);
    viewport.addEventListener('pointercancel', onPointerCancel, true);
    viewport.addEventListener('contextmenu', onContextMenu);
    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown, true);
      viewport.removeEventListener('pointermove', onPointerMove, true);
      viewport.removeEventListener('pointerup', onPointerUp, true);
      viewport.removeEventListener('pointercancel', onPointerCancel, true);
      viewport.removeEventListener('contextmenu', onContextMenu);
      viewport.style.cursor = '';
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isShotViewActive() || inputIsEditing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const state = useDirectorStore.getState();
      const shot = state.getActiveShot();
      if (shot.status === 'APPROVED') return;
      const camera = sampleCamera(shot.camera, state.playhead);
      const pose = cameraArrowTranslation(camera, event.key, event.shiftKey ? 0.6 : 0.12);
      if (!pose) return;
      setCameraEntityPose(pose.position, pose.target);
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  if (!shotView || !consoleTarget) return null;
  return createPortal(<div
    data-shot-camera-navigation
    style={{
      position: 'absolute',
      zIndex: 9,
      top: 54,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      maxWidth: 'min(620px, calc(100% - 720px))',
      padding: '7px 10px',
      border: '1px solid rgba(88,118,143,.6)',
      borderRadius: 999,
      background: 'rgba(12,18,24,.88)',
      backdropFilter: 'blur(9px)',
      color: '#9eb3c3',
      fontSize: 9,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}
  ><b style={{ color: '#e2edf6', fontSize: 10 }}>机位自由移动</b><span>← → 左右平移 · ↑ ↓ 前后推拉 · Shift 加速 · 鼠标右键拖动平移机位</span></div>, consoleTarget);
}
