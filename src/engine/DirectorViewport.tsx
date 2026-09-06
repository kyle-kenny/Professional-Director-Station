import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { useDirectorStore } from '../store/directorStore';
import { focalLengthToVerticalFovDeg } from '../utils/math';
import type { Actor } from '../domain/model';

function tempToColor(k: number, fallback: string) {
  if (k < 3800) return new THREE.Color('#ffd6a3');
  if (k > 8000) return new THREE.Color('#a9c7ff');
  return new THREE.Color(fallback);
}

function actorAccent(actor: Actor) {
  const male = actor.demographics.sex === 'male';
  if (actor.demographics.ageGroup === 'child') return male ? '#69a8d8' : '#d995b5';
  if (actor.demographics.ageGroup === 'teen') return male ? '#5b9bd5' : '#d287aa';
  if (actor.demographics.ageGroup === 'elderly') return male ? '#75869a' : '#a68a9a';
  return male ? '#467fb8' : '#c87596';
}

function buildDirectorActor(actor: Actor) {
  const d = actor.demographics;
  const group = new THREE.Group();
  group.name = actor.name;
  group.userData.actorId = actor.id;
  const rig = new THREE.Group();
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

  const torso = new THREE.Mesh(new THREE.BoxGeometry(d.shoulderWidthM, torsoH, d.bodyDepthM), cloth);
  torso.position.y = legH + torsoH / 2; torso.castShadow = true; torso.userData.actorId = actor.id; rig.add(torso);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(hipW, Math.max(0.10, h * 0.07), d.bodyDepthM * 0.92), dark);
  pelvis.position.y = legH - h * 0.025; pelvis.castShadow = true; pelvis.userData.actorId = actor.id; rig.add(pelvis);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 16), skin);
  head.position.y = h - headR; head.castShadow = true; head.userData.actorId = actor.id; rig.add(head);

  const legGeom = new THREE.CapsuleGeometry(limbR, Math.max(0.08, legH - limbR * 2), 5, 10);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeom, dark);
    leg.position.set(side * hipW * 0.23, legH / 2, 0); leg.castShadow = true; leg.userData.actorId = actor.id; rig.add(leg);
  }

  const armLen = Math.max(0.28, torsoH * 0.92);
  const armGeom = new THREE.CapsuleGeometry(limbR * 0.82, Math.max(0.06, armLen - limbR * 1.64), 5, 10);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeom, skin);
    arm.position.set(side * (d.shoulderWidthM / 2 + limbR * 0.4), legH + torsoH * 0.52, 0);
    arm.rotation.z = side * 0.035; arm.castShadow = true; arm.userData.actorId = actor.id; rig.add(arm);
  }

  const facing = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, Math.min(h * 0.82, actor.eyeHeight), 0), Math.max(0.4, h * 0.32), 0xffd166, 0.13, 0.08);
  rig.add(facing);
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
  raf: number;
};

export function DirectorViewport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [viewMode, setViewMode] = useState<'director' | 'shot'>('director');
  const viewModeRef = useRef(viewMode);
  const shot = useDirectorStore((s) => s.getActiveShot());
  const selectedObjectId = useDirectorStore((s) => s.selectedObjectId);
  const selectObject = useDirectorStore((s) => s.selectObject);
  const transformMode = useDirectorStore((s) => s.transformMode);
  const setTransformMode = useDirectorStore((s) => s.setTransformMode);

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (editable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === 'w') setTransformMode('translate');
      else if (event.key.toLowerCase() === 'e') setTransformMode('rotate');
      else if (event.key.toLowerCase() === 'r') setTransformMode('scale');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTransformMode]);

  useEffect(() => {
    if (!mountRef.current) return;
    const host = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14181e');

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const editorCamera = new THREE.PerspectiveCamera(48, 1, 0.01, 500);
    editorCamera.position.set(7.5, 5.5, 8.5);
    const shotCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);

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

    function resize() {
      const w = host.clientWidth || 800;
      const h = host.clientHeight || 500;
      renderer.setSize(w, h, false);
      editorCamera.aspect = w / h;
      editorCamera.updateProjectionMatrix();
      shotCamera.aspect = w / h;
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
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, viewModeRef.current === 'shot' ? shotCamera : editorCamera);
      const hits = raycaster.intersectObjects(content.children, true);
      const id = hits[0]?.object.userData.actorId as string | undefined;
      if (id) selectObject(id);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onTransformEnd = () => {
      const object = transform.object;
      const actorId = object?.userData.actorId as string | undefined;
      if (!object || !actorId) return;
      useDirectorStore.getState().setActorTransform(actorId, {
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
        scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
      });
    };
    transform.addEventListener('mouseUp', onTransformEnd);

    let raf = 0;
    const animate = () => {
      controls.enabled = viewModeRef.current === 'director' && !transform.dragging;
      controls.update();
      renderer.render(scene, viewModeRef.current === 'shot' ? shotCamera : editorCamera);
      raf = requestAnimationFrame(animate);
    };
    animate();
    runtime.current = { scene, renderer, editorCamera, shotCamera, controls, transform, content, actorObjects, raf };

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
    r.transform.setMode(transformMode);
    r.transform.setSpace(transformMode === 'translate' ? 'world' : 'local');
  }, [transformMode]);

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

    shot.actors.forEach((actor) => {
      const group = buildDirectorActor(actor);
      group.position.set(actor.transform.position.x, actor.transform.position.y, actor.transform.position.z);
      group.rotation.set(actor.transform.rotation.x, actor.transform.rotation.y, actor.transform.rotation.z);
      group.scale.set(actor.transform.scale.x, actor.transform.scale.y, actor.transform.scale.z);
      r.content.add(group);
      r.actorObjects.set(actor.id, group);
    });

    shot.lights.forEach((l) => {
      const color = tempToColor(l.colorTemperatureK, l.color);
      let light: THREE.Light;
      if (l.type === 'ambient') light = new THREE.AmbientLight(color, l.intensity);
      else if (l.type === 'point') light = new THREE.PointLight(color, l.intensity, 25, 2);
      else if (l.type === 'spot') {
        const s = new THREE.SpotLight(color, l.intensity, 30, Math.PI / 5, 0.4, 1.2);
        s.target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
        r.content.add(s.target);
        light = s;
      } else {
        const d = new THREE.DirectionalLight(color, l.intensity);
        d.target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
        r.content.add(d.target);
        light = d;
      }
      light.position.set(l.position.x, l.position.y, l.position.z);
      light.castShadow = l.castShadow;
      r.content.add(light);
      if (l.type !== 'ambient') {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color }));
        marker.position.copy(light.position);
        r.content.add(marker);
      }
    });

    r.shotCamera.fov = focalLengthToVerticalFovDeg(shot.camera.focalLengthMm, shot.camera.sensorWidthMm, r.shotCamera.aspect);
    r.shotCamera.position.set(shot.camera.position.x, shot.camera.position.y, shot.camera.position.z);
    r.shotCamera.lookAt(shot.camera.target.x, shot.camera.target.y, shot.camera.target.z);
    r.shotCamera.updateProjectionMatrix();
    r.content.add(new THREE.CameraHelper(r.shotCamera));

    const selected = selectedObjectId ? r.actorObjects.get(selectedObjectId) : undefined;
    if (selected && viewMode === 'director') {
      r.transform.camera = r.editorCamera;
      r.transform.attach(selected);
    }
  }, [shot, selectedObjectId, viewMode]);

  return <div className="viewport-shell">
    <div className="viewport-toolbar">
      <span className="chip">3D Blocking / Previs</span>
      <button className={viewMode === 'director' ? 'active' : ''} onClick={() => setViewMode('director')}>导演视图</button>
      <button className={viewMode === 'shot' ? 'active' : ''} onClick={() => setViewMode('shot')}>镜头视图</button>
      <button className={transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')} title="W">移动 W</button>
      <button className={transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')} title="E">旋转 E</button>
      <button className={transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')} title="R">缩放 R</button>
      <span>5cm · 15° · 5% Snap</span>
      <span className="lens-readout">{shot.camera.focalLengthMm}mm · f/{shot.camera.aperture}</span>
    </div>
    <div className="viewport" ref={mountRef} />
  </div>;
}
