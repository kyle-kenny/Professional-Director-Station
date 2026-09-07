import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useDirectorStore } from '../store/directorStore';
import { fitAspectRect, focalLengthToVerticalFovDeg } from '../utils/math';
import { correlatedColorTemperatureToSrgb } from '../utils/lightColor';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import { resolvePoseDefinition } from '../domain/poseLibrary';
import type { Actor, DirectorLight, Vec3 } from '../domain/model';

function directorLightColor(light: DirectorLight) {
  const cct = correlatedColorTemperatureToSrgb(light.colorTemperatureK);
  const color = new THREE.Color(cct.r, cct.g, cct.b).convertSRGBToLinear();
  return color.multiply(new THREE.Color(light.color));
}

function actorAccent(actor: Actor) {
  const male = actor.demographics.sex === 'male';
  if (actor.demographics.ageGroup === 'child') return male ? '#69a8d8' : '#d995b5';
  if (actor.demographics.ageGroup === 'teen') return male ? '#5b9bd5' : '#d287aa';
  if (actor.demographics.ageGroup === 'elderly') return male ? '#75869a' : '#a68a9a';
  return male ? '#467fb8' : '#c87596';
}

function applyRotation(object: THREE.Object3D, value?: Vec3) {
  if (value) object.rotation.set(value.x, value.y, value.z);
}

function buildDirectorActor(actor: Actor) {
  const d = actor.demographics;
  const pose = resolvePoseDefinition(actor.pose);
  const group = new THREE.Group();
  group.name = actor.name;
  group.userData.actorId = actor.id;
  const rig = new THREE.Group();
  rig.position.y += pose.rootOffsetY;
  if (d.posture === 'elderly') { rig.rotation.x = -0.08; rig.position.z = 0.035; }
  else if (d.posture === 'relaxed') rig.rotation.x = -0.025;
  group.add(rig);

  const accent = actorAccent(actor);
  const skin = new THREE.MeshStandardMaterial({ color: '#d7af94', roughness: 0.82 });
  const cloth = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#343b45', roughness: 0.9 });
  const h = d.heightM;
  const headR = d.headRadiusM;
  const legH = h * (d.ageGroup === 'child' ? 0.39 : d.ageGroup === 'elderly' ? 0.43 : 0.46);
  const torsoTop = h - headR * 2.2;
  const torsoH = Math.max(0.34, torsoTop - legH);
  const hipW = d.shoulderWidthM * (d.sex === 'female' ? 0.78 : 0.72);
  const limbR = Math.max(0.035, d.shoulderWidthM * 0.095);

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = legH;
  applyRotation(torsoPivot, pose.jointRotations.torso);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(d.shoulderWidthM, torsoH, d.bodyDepthM), cloth);
  torso.position.y = torsoH / 2;
  torso.castShadow = true;
  torso.userData.actorId = actor.id;
  torsoPivot.add(torso);
  rig.add(torsoPivot);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(hipW, Math.max(0.10, h * 0.07), d.bodyDepthM * 0.92), dark);
  pelvis.position.y = legH - h * 0.025;
  pelvis.castShadow = true;
  pelvis.userData.actorId = actor.id;
  rig.add(pelvis);

  const headPivot = new THREE.Group();
  headPivot.position.y = h - headR * 2;
  applyRotation(headPivot, pose.jointRotations.head);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 16), skin);
  head.position.y = headR;
  head.castShadow = true;
  head.userData.actorId = actor.id;
  headPivot.add(head);
  rig.add(headPivot);

  const legGeom = new THREE.CapsuleGeometry(limbR, Math.max(0.08, legH - limbR * 2), 5, 10);
  const addLeg = (side: 'left' | 'right', x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, legH, 0);
    applyRotation(pivot, pose.jointRotations[side === 'left' ? 'leftLeg' : 'rightLeg']);
    const mesh = new THREE.Mesh(legGeom, dark);
    mesh.position.y = -legH / 2;
    mesh.castShadow = true;
    mesh.userData.actorId = actor.id;
    pivot.add(mesh);
    rig.add(pivot);
  };
  addLeg('left', -hipW * 0.23);
  addLeg('right', hipW * 0.23);

  const armLen = Math.max(0.28, torsoH * 0.92);
  const armGeom = new THREE.CapsuleGeometry(limbR * 0.82, Math.max(0.06, armLen - limbR * 1.64), 5, 10);
  const shoulderY = legH + torsoH * 0.82;
  const addArm = (side: 'left' | 'right', x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, shoulderY, 0);
    pivot.rotation.z = side === 'left' ? -0.035 : 0.035;
    applyRotation(pivot, pose.jointRotations[side === 'left' ? 'leftArm' : 'rightArm']);
    const mesh = new THREE.Mesh(armGeom, skin);
    mesh.position.y = -armLen / 2;
    mesh.castShadow = true;
    mesh.userData.actorId = actor.id;
    pivot.add(mesh);
    rig.add(pivot);
  };
  addArm('left', -(d.shoulderWidthM / 2 + limbR * 0.15));
  addArm('right', d.shoulderWidthM / 2 + limbR * 0.15);

  const facing = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, Math.min(h * 0.82, actor.eyeHeight), 0), Math.max(0.4, h * 0.32), 0xffd166, 0.13, 0.08);
  rig.add(facing);
  return group;
}

function buildLightMarker(light: DirectorLight, color: THREE.Color) {
  const group = new THREE.Group();
  group.name = `LIGHT · ${light.name}`;
  group.position.set(light.position.x, light.position.y, light.position.z);
  group.userData.lightId = light.id;
  const material = new THREE.MeshBasicMaterial({ color, wireframe: light.type !== 'point' });
  let mesh: THREE.Mesh;
  if (light.type === 'point') mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), material);
  else if (light.type === 'area') mesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.05), material);
  else mesh = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 12), material);
  mesh.userData.lightId = light.id;
  group.add(mesh);
  const axis = new THREE.AxesHelper(0.32);
  axis.userData.lightId = light.id;
  group.add(axis);
  return group;
}

type Runtime = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  editorCamera: THREE.PerspectiveCamera;
  shotCamera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transform: TransformControls;
  content: THREE.Group;
  actorObjects: Map<string, THREE.Group>;
  lightObjects: Map<string, THREE.Group>;
  raf: number;
};

export function DirectorViewport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [viewMode, setViewMode] = useState<'director' | 'shot'>('director');
  const viewModeRef = useRef(viewMode);
  const shot = useDirectorStore((s) => s.getActiveShot());
  const shotAspectRef = useRef(shot.frameAspect);
  const playhead = useDirectorStore((s) => s.playhead);
  const selectedObjectId = useDirectorStore((s) => s.selectedObjectId);
  const selectObject = useDirectorStore((s) => s.selectObject);
  const transformMode = useDirectorStore((s) => s.transformMode);
  const setTransformMode = useDirectorStore((s) => s.setTransformMode);
  const sampledCamera = sampleCamera(shot.camera, playhead);
  const selectedIsLight = shot.lights.some((light) => light.id === selectedObjectId);
  const shotEditable = shot.status !== 'APPROVED';

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { shotAspectRef.current = shot.frameAspect; }, [shot.frameAspect]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (editable || !shotEditable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === 'w') setTransformMode('translate');
      else if (!selectedIsLight && event.key.toLowerCase() === 'e') setTransformMode('rotate');
      else if (!selectedIsLight && event.key.toLowerCase() === 'r') setTransformMode('scale');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTransformMode, selectedIsLight, shotEditable]);

  useEffect(() => {
    if (!mountRef.current) return;
    const host = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14181e');

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    RectAreaLightUniformsLib.init();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);

    const editorCamera = new THREE.PerspectiveCamera(48, 1, 0.01, 500);
    editorCamera.position.set(7.5, 5.5, 8.5);
    const shotCamera = new THREE.PerspectiveCamera(40, shotAspectRef.current, 0.01, 500);

    const controls = new OrbitControls(editorCamera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;

    const transform = new TransformControls(editorCamera, renderer.domElement);
    transform.setMode('translate');
    transform.setSpace('world');
    transform.setTranslationSnap(0.05);
    transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    transform.setScaleSnap(0.05);
    transform.setSize(0.85);
    scene.add(transform.getHelper());

    const grid = new THREE.GridHelper(20, 20, '#45515e', '#2a333d');
    scene.add(grid);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#20262d', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.y = -0.002;
    scene.add(floor);
    const content = new THREE.Group();
    scene.add(content);

    const actorObjects = new Map<string, THREE.Group>();
    const lightObjects = new Map<string, THREE.Group>();

    function resize() {
      const w = host.clientWidth || 800;
      const h = host.clientHeight || 500;
      renderer.setSize(w, h, false);
      editorCamera.aspect = w / h;
      editorCamera.updateProjectionMatrix();
      shotCamera.aspect = shotAspectRef.current;
      shotCamera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (ev: PointerEvent) => {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      let localX = ev.clientX - rect.left;
      let localY = ev.clientY - rect.top;
      let targetWidth = rect.width;
      let targetHeight = rect.height;
      if (viewModeRef.current === 'shot') {
        const frame = fitAspectRect(rect.width, rect.height, shotAspectRef.current);
        if (localX < frame.x || localX > frame.x + frame.width || localY < frame.y || localY > frame.y + frame.height) return;
        localX -= frame.x;
        localY -= frame.y;
        targetWidth = frame.width;
        targetHeight = frame.height;
      }
      pointer.x = (localX / targetWidth) * 2 - 1;
      pointer.y = -(localY / targetHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, viewModeRef.current === 'shot' ? shotCamera : editorCamera);
      const hits = raycaster.intersectObjects(content.children, true);
      const object = hits[0]?.object;
      const id = (object?.userData.actorId as string | undefined) ?? (object?.userData.lightId as string | undefined);
      if (id) selectObject(id);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onTransformEnd = () => {
      const object = transform.object;
      if (!object || useDirectorStore.getState().getActiveShot().status === 'APPROVED') return;
      const actorId = object.userData.actorId as string | undefined;
      const lightId = object.userData.lightId as string | undefined;
      if (actorId) {
        useDirectorStore.getState().setActorTransform(actorId, {
          position: { x: object.position.x, y: object.position.y, z: object.position.z },
          rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
          scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
        });
      } else if (lightId) {
        useDirectorStore.getState().setLightPosition(lightId, { x: object.position.x, y: object.position.y, z: object.position.z });
      }
    };
    transform.addEventListener('mouseUp', onTransformEnd);

    let raf = 0;
    const animate = () => {
      controls.enabled = viewModeRef.current === 'director' && !transform.dragging;
      controls.update();
      const width = renderer.domElement.clientWidth || 1;
      const height = renderer.domElement.clientHeight || 1;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.setClearColor(0x080b0f, 1);
      renderer.clear(true, true, true);
      if (viewModeRef.current === 'shot') {
        const frame = fitAspectRect(width, height, shotAspectRef.current);
        const bottom = height - frame.y - frame.height;
        renderer.setViewport(frame.x, bottom, frame.width, frame.height);
        renderer.setScissor(frame.x, bottom, frame.width, frame.height);
        renderer.setScissorTest(true);
        renderer.setClearColor(0x14181e, 1);
        renderer.clear(true, true, true);
        renderer.render(scene, shotCamera);
        renderer.setScissorTest(false);
      } else {
        renderer.setClearColor(0x14181e, 1);
        renderer.clear(true, true, true);
        renderer.render(scene, editorCamera);
      }
      raf = requestAnimationFrame(animate);
    };
    animate();
    runtime.current = { scene, renderer, editorCamera, shotCamera, controls, transform, content, actorObjects, lightObjects, raf };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      transform.removeEventListener('mouseUp', onTransformEnd);
      transform.detach();
      transform.dispose();
      controls.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      runtime.current = null;
    };
  }, [selectObject]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.transform.setMode(selectedIsLight ? 'translate' : transformMode);
    r.transform.setSpace(selectedIsLight || transformMode === 'translate' ? 'world' : 'local');
  }, [transformMode, selectedIsLight]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;

    r.transform.detach();
    r.content.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    r.content.clear();
    r.actorObjects.clear();
    r.lightObjects.clear();
    r.renderer.toneMappingExposure = Math.pow(2, shot.exposureEv);

    shot.actors.forEach((actor) => {
      const group = buildDirectorActor(actor);
      const transform = sampleActorTransform(actor, playhead);
      group.position.set(transform.position.x, transform.position.y, transform.position.z);
      group.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
      group.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
      r.content.add(group);
      r.actorObjects.set(actor.id, group);
    });

    shot.lights.forEach((source) => {
      const l = sampleLight(source, playhead);
      const color = directorLightColor(l);
      let light: THREE.Light;
      if (l.type === 'ambient') light = new THREE.AmbientLight(color, l.intensity);
      else if (l.type === 'point') light = new THREE.PointLight(color, l.intensity, 0, 2);
      else if (l.type === 'spot') {
        const spot = new THREE.SpotLight(color, l.intensity, 0, Math.PI / 5, 0.4, 2);
        spot.target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
        r.content.add(spot.target);
        light = spot;
      } else if (l.type === 'area') {
        light = new THREE.RectAreaLight(color, l.intensity, 2, 1);
      } else {
        const directional = new THREE.DirectionalLight(color, l.intensity);
        directional.target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
        r.content.add(directional.target);
        light = directional;
      }
      light.position.set(l.position.x, l.position.y, l.position.z);
      if (l.type === 'area' && l.target) light.lookAt(l.target.x, l.target.y, l.target.z);
      light.castShadow = l.type !== 'area' && l.type !== 'ambient' && l.castShadow;
      r.content.add(light);
      if (l.type !== 'ambient') {
        const marker = buildLightMarker(l, color);
        r.content.add(marker);
        r.lightObjects.set(source.id, marker);
      }
    });

    const cameraAtTime = sampleCamera(shot.camera, playhead);
    r.shotCamera.aspect = shot.frameAspect;
    r.shotCamera.fov = focalLengthToVerticalFovDeg(cameraAtTime.focalLengthMm, cameraAtTime.sensorWidthMm, shot.frameAspect);
    r.shotCamera.position.set(cameraAtTime.position.x, cameraAtTime.position.y, cameraAtTime.position.z);
    r.shotCamera.lookAt(cameraAtTime.target.x, cameraAtTime.target.y, cameraAtTime.target.z);
    r.shotCamera.updateProjectionMatrix();
    r.content.add(new THREE.CameraHelper(r.shotCamera));

    const selected = selectedObjectId ? r.actorObjects.get(selectedObjectId) ?? r.lightObjects.get(selectedObjectId) : undefined;
    if (selected && viewMode === 'director' && shotEditable) {
      r.transform.camera = r.editorCamera;
      r.transform.attach(selected);
    }
  }, [shot, selectedObjectId, viewMode, playhead, shotEditable]);

  return <div className="viewport-shell">
    <div className="viewport-toolbar">
      <span className="chip">3D Blocking / Previs</span>
      <button className={viewMode === 'director' ? 'active' : ''} onClick={() => setViewMode('director')}>导演视图</button>
      <button className={viewMode === 'shot' ? 'active' : ''} onClick={() => setViewMode('shot')}>镜头视图</button>
      <button disabled={!shotEditable} className={shotEditable && transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')} title="W">移动 W</button>
      <button disabled={!shotEditable || selectedIsLight} className={shotEditable && !selectedIsLight && transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')} title="E">旋转 E</button>
      <button disabled={!shotEditable || selectedIsLight} className={shotEditable && !selectedIsLight && transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')} title="R">缩放 R</button>
      <span>{shotEditable ? (selectedIsLight ? '灯具 Gizmo · 世界坐标 · 5cm Snap' : '5cm · 15° · 5% Snap') : 'APPROVED · 只读；请在 Review 中创建新 WIP'}</span>
      <span className="lens-readout">T {playhead.toFixed(2)}s · {sampledCamera.focalLengthMm.toFixed(0)}mm · f/{sampledCamera.aperture} · {shot.frameAspect.toFixed(3)}:1 · EV {shot.exposureEv >= 0 ? '+' : ''}{shot.exposureEv.toFixed(1)}</span>
    </div>
    <div className="viewport" ref={mountRef} />
  </div>;
}
