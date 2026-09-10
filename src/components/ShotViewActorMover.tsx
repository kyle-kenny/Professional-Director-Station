import { useEffect, useRef } from 'react';
import type { DirectorProject, Transform } from '../domain/model';
import { previewActorTransform, shotViewPointerGroundPoint, translateTransformOnGround } from '../domain/shotViewMovement';
import { useDirectorStore } from '../store/directorStore';
import { sampleActorTransform, sampleCamera } from '../utils/animation';

type PendingDrag = { pointerId: number; x: number; y: number };
type DragSession = {
  pointerId: number;
  actorId: string;
  sequenceId: string;
  shotId: string;
  playhead: number;
  baseProject: DirectorProject;
  baseUndo: DirectorProject[];
  baseRedo: DirectorProject[];
  baseTransform: Transform;
  startGround: { x: number; y: number; z: number };
  finalTransform: Transform;
};

function shotViewIsActive() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.director-console-3d .viewport-toolbar button');
  return Array.from(buttons).some((button) => button.textContent?.trim() === '镜头视图' && button.classList.contains('active'));
}

export function ShotViewActorMover() {
  const pendingRef = useRef<PendingDrag | null>(null);
  const dragRef = useRef<DragSession | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.director-console-3d');
    if (!root) return;
    let canvas: HTMLCanvasElement | null = null;

    const restoreBase = (session: DragSession) => {
      useDirectorStore.setState({
        project: structuredClone(session.baseProject),
        undoStack: session.baseUndo,
        redoStack: session.baseRedo,
      });
    };

    const cancelDrag = () => {
      const session = dragRef.current;
      if (session) restoreBase(session);
      dragRef.current = null;
      pendingRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !shotViewIsActive()) return;
      const state = useDirectorStore.getState();
      if (state.getActiveShot().status === 'APPROVED') return;
      pendingRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId || !canvas || !shotViewIsActive()) return;
      if (!dragRef.current && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 4) return;

      if (!dragRef.current) {
        const state = useDirectorStore.getState();
        const shot = state.getActiveShot();
        const actor = shot.actors.find((item) => item.id === state.selectedObjectId);
        if (!actor || shot.status === 'APPROVED') { pendingRef.current = null; return; }
        const rect = canvas.getBoundingClientRect();
        const baseTransform = sampleActorTransform(actor, state.playhead);
        const camera = sampleCamera(shot.camera, state.playhead);
        const startGround = shotViewPointerGroundPoint(
          { x: pending.x - rect.left, y: pending.y - rect.top },
          { width: rect.width, height: rect.height },
          shot.frameAspect,
          camera,
          baseTransform.position.y,
        );
        if (!startGround) { pendingRef.current = null; return; }
        dragRef.current = {
          pointerId: event.pointerId,
          actorId: actor.id,
          sequenceId: state.activeSequenceId,
          shotId: state.activeShotId,
          playhead: state.playhead,
          baseProject: structuredClone(state.project),
          baseUndo: state.undoStack,
          baseRedo: state.redoStack,
          baseTransform,
          startGround,
          finalTransform: baseTransform,
        };
        canvas.setPointerCapture?.(event.pointerId);
      }

      const session = dragRef.current;
      if (!session) return;
      const state = useDirectorStore.getState();
      const shot = state.project.sequences.find((sequence) => sequence.id === session.sequenceId)?.shots.find((item) => item.id === session.shotId);
      if (!shot || shot.status === 'APPROVED') { cancelDrag(); return; }
      const rect = canvas.getBoundingClientRect();
      const camera = sampleCamera(shot.camera, session.playhead);
      const currentGround = shotViewPointerGroundPoint(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { width: rect.width, height: rect.height },
        shot.frameAspect,
        camera,
        session.baseTransform.position.y,
      );
      if (!currentGround) return;

      const nextTransform = translateTransformOnGround(session.baseTransform, session.startGround, currentGround);
      session.finalTransform = nextTransform;
      const previewProject = previewActorTransform(
        session.baseProject,
        session.sequenceId,
        session.shotId,
        session.actorId,
        session.playhead,
        nextTransform,
      );
      useDirectorStore.setState({ project: previewProject, undoStack: session.baseUndo, redoStack: session.baseRedo });
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pendingRef.current?.pointerId !== event.pointerId) return;
      const session = dragRef.current;
      pendingRef.current = null;
      dragRef.current = null;
      if (!session) return;
      restoreBase(session);
      useDirectorStore.getState().setActorTransform(session.actorId, session.finalTransform);
      if (canvas?.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (pendingRef.current?.pointerId !== event.pointerId) return;
      if (canvas?.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      cancelDrag();
    };

    const detach = () => {
      if (!canvas) return;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas = null;
    };

    const attach = () => {
      const next = root.querySelector<HTMLCanvasElement>('.viewport canvas');
      if (next === canvas) return;
      detach();
      canvas = next;
      if (!canvas) return;
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove, { passive: false });
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelDrag();
      detach();
    };
  }, []);

  return null;
}
