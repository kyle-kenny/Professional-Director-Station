import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DirectorProject, Transform } from '../domain/model';
import {
  previewActorTransform,
  shotViewPointerGroundPoint,
  shotViewWorldPoint,
  translateTransformOnGround,
} from '../domain/shotViewMovement';
import { useDirectorStore } from '../store/directorStore';
import { sampleActorTransform, sampleCamera } from '../utils/animation';

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

type ShotViewActorMoverProps = {
  active: boolean;
  viewportTarget: HTMLElement | null;
};

export function ShotViewActorMover({ active, viewportTarget }: ShotViewActorMoverProps) {
  const dragRef = useRef<DragSession | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const shot = useDirectorStore((state) => state.getActiveShot());
  const playhead = useDirectorStore((state) => state.playhead);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const actor = shot.actors.find((item) => item.id === selectedObjectId);
  const editable = shot.status !== 'APPROVED';

  useEffect(() => {
    if (!viewportTarget) { setViewportSize({ width: 0, height: 0 }); return; }
    const update = () => setViewportSize({ width: viewportTarget.clientWidth, height: viewportTarget.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewportTarget);
    return () => observer.disconnect();
  }, [viewportTarget]);

  const dragBox = useMemo(() => {
    if (!active || !viewportTarget || !actor || !editable || viewportSize.width <= 0 || viewportSize.height <= 0) return undefined;
    const transform = sampleActorTransform(actor, playhead);
    const camera = sampleCamera(shot.camera, playhead);
    const feet = shotViewWorldPoint(transform.position, viewportSize, shot.frameAspect, camera);
    const actorHeight = actor.demographics.heightM * Math.max(0.1, Math.abs(transform.scale.y));
    const head = shotViewWorldPoint(
      { x: transform.position.x, y: transform.position.y + actorHeight, z: transform.position.z },
      viewportSize,
      shot.frameAspect,
      camera,
    );
    if (!feet || !head) return undefined;
    const projectedHeight = Math.abs(feet.y - head.y);
    if (projectedHeight < 8) return undefined;
    const width = Math.max(40, Math.min(150, projectedHeight * 0.42));
    const top = Math.min(feet.y, head.y) - 8;
    const height = projectedHeight + 16;
    return {
      left: (feet.x + head.x) * 0.5 - width * 0.5,
      top,
      width,
      height,
    };
  }, [active, actor, editable, playhead, shot.camera, shot.frameAspect, viewportSize, viewportTarget]);

  const restoreBase = (session: DragSession) => {
    useDirectorStore.setState({
      project: structuredClone(session.baseProject),
      undoStack: session.baseUndo,
      redoStack: session.baseRedo,
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !active || !viewportTarget || !actor || !editable) return;
    const state = useDirectorStore.getState();
    const currentShot = state.getActiveShot();
    const currentActor = currentShot.actors.find((item) => item.id === actor.id);
    if (!currentActor || currentShot.status === 'APPROVED') return;
    const rect = viewportTarget.getBoundingClientRect();
    const baseTransform = sampleActorTransform(currentActor, state.playhead);
    const camera = sampleCamera(currentShot.camera, state.playhead);
    const startGround = shotViewPointerGroundPoint(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      currentShot.frameAspect,
      camera,
      baseTransform.position.y,
    );
    if (!startGround) return;
    dragRef.current = {
      pointerId: event.pointerId,
      actorId: currentActor.id,
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
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId || !viewportTarget) return;
    const state = useDirectorStore.getState();
    const currentShot = state.project.sequences.find((sequence) => sequence.id === session.sequenceId)?.shots.find((item) => item.id === session.shotId);
    if (!currentShot || currentShot.status === 'APPROVED') return;
    const rect = viewportTarget.getBoundingClientRect();
    const camera = sampleCamera(currentShot.camera, session.playhead);
    const currentGround = shotViewPointerGroundPoint(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      currentShot.frameAspect,
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
    event.stopPropagation();
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    restoreBase(session);
    if (commit) useDirectorStore.getState().setActorTransform(session.actorId, session.finalTransform);
    event.preventDefault();
    event.stopPropagation();
  };

  if (!active || !viewportTarget || !actor || !editable || !dragBox) return null;

  return createPortal(<button
    type="button"
    className="shot-actor-drag-handle"
    aria-label={`平移 ${actor.name}`}
    title="拖动人物：保持脚底高度，在镜头构图中平移场面调度位置"
    data-shot-actor-drag-handle={actor.id}
    style={dragBox}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={(event) => finishDrag(event, true)}
    onPointerCancel={(event) => finishDrag(event, false)}
  ><span aria-hidden="true" /></button>, viewportTarget);
}
