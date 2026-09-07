import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useDirectorStore } from '../store/directorStore';
import { fitAspectRect, focalLengthToVerticalFovDeg } from '../utils/math';
import { correlatedColorTemperatureToSrgb } from '../utils/lightColor';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import type { DirectorLight } from '../domain/model';
import { instantiateDirectorCharacter } from '../characters/characterLoader';
import { uiZh } from '../i18n/zhCN';

function directorLightColor(light: DirectorLight) {
  const cct = correlatedColorTemperatureToSrgb(light.colorTemperatureK);
  const color = new THREE.Color(cct.r, cct.g, cct.b).convertSRGBToLinear();
  return color.multiply(new THREE.Color(light.color));
}

function buildLightMarker(light: DirectorLight, color: THREE.Color) {
  const group = new THREE.Group();
  group.name = `灯具 · ${light.name}`;
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

type LightRuntime = {
  light: THREE.Light;
  marker?: THREE.Group;
  target?: THREE.Object3D;
};

type Runtime = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  editorCamera: THREE.PerspectiveCamera;
  shotCamera: THREE.PerspectiveCamera;
  cameraHelper?: THREE.CameraHelper;
  controls: OrbitControls;
  transform: TransformControls;
  content: THREE.Group;
  actorObjects: Map<string, THREE.Group>;
  lightObjects: Map<string, THREE.Group>;
  lights: Map<string, LightRuntime>;
  raf: number;
};

type CharacterLoadState = { loaded: number; total: number; failed: number };

function disposeSceneContent(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry && !object.userData.sharedCharacterGeometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}

export function DirectorViewport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const [viewMode, setViewMode] = useState<'director' | 'shot'>('director');
  const [characterLoad, setCharacterLoad] = useState<CharacterLoadState>({ loaded: 0, total: 0, failed: 0 });
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
    const lights = new Map<string, LightRuntime>();

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
    runtime.current = { scene, renderer, editorCamera, shotCamera, controls, transform, content, actorObjects, lightObjects, lights, raf };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      transform.removeEventListener('mouseUp', onTransformEnd);
      transform.detach();
      transform.dispose();
      controls.dispose();
      disposeSceneContent(content);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
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
    let cancelled = false;
    r.transform.detach();
    disposeSceneContent(r.content);
    r.content.clear();
    r.actorObjects.clear();
    r.lightObjects.clear();
    r.lights.clear();
    r.cameraHelper = undefined;
    const time = useDirectorStore.getState().playhead;
    setCharacterLoad({ loaded: 0, total: shot.actors.length, failed: 0 });

    for (const actor of shot.actors) {
      const anchor = new THREE.Group();
      anchor.name = actor.name;
      anchor.userData.actorId = actor.id;
      const transformAtTime = sampleActorTransform(actor, time);
      anchor.position.set(transformAtTime.position.x, transformAtTime.position.y, transformAtTime.position.z);
      anchor.rotation.set(transformAtTime.rotation.x, transformAtTime.rotation.y, transformAtTime.rotation.z);
      anchor.scale.set(transformAtTime.scale.x, transformAtTime.scale.y, transformAtTime.scale.z);
      r.content.add(anchor);
      r.actorObjects.set(actor.id, anchor);
      void instantiateDirectorCharacter(actor).then(({ root }) => {
        if (cancelled || runtime.current !== r || r.actorObjects.get(actor.id) !== anchor) {
          disposeSceneContent(root);
          return;
        }
        anchor.add(root);
        setCharacterLoad((state) => ({ ...state, loaded: state.loaded + 1 }));
      }).catch((error) => {
        console.error(`角色 ${actor.name} 加载失败`, error);
        if (!cancelled) setCharacterLoad((state) => ({ ...state, failed: state.failed + 1 }));
      });
    }

    for (const source of shot.lights) {
      const l = sampleLight(source, time);
      const color = directorLightColor(l);
      let light: THREE.Light;
      let target: THREE.Object3D | undefined;
      if (l.type === 'ambient') light = new THREE.AmbientLight(color, l.intensity);
      else if (l.type === 'point') light = new THREE.PointLight(color, l.intensity, 0, 2);
      else if (l.type === 'spot') {
        const spot = new THREE.SpotLight(color, l.intensity, 0, Math.PI / 5, 0.4, 2);
        target = spot.target;
        target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
        r.content.add(target);
        light = spot;
      } else if (l.type === 'area') light = new THREE.RectAreaLight(color, l.intensity, 2, 1);
      else {
        const directional = new THREE.DirectionalLight(color, l.intensity);
        target = directional.target;
        target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
        r.content.add(target);
        light = directional;
      }
      light.position.set(l.position.x, l.position.y, l.position.z);
      if (l.type === 'area' && l.target) light.lookAt(l.target.x, l.target.y, l.target.z);
      light.castShadow = l.type !== 'area' && l.type !== 'ambient' && l.castShadow;
      r.content.add(light);
      let marker: THREE.Group | undefined;
      if (l.type !== 'ambient') {
        marker = buildLightMarker(l, color);
        r.content.add(marker);
        r.lightObjects.set(source.id, marker);
      }
      r.lights.set(source.id, { light, marker, target });
    }

    const cameraAtTime = sampleCamera(shot.camera, time);
    r.shotCamera.aspect = shot.frameAspect;
    r.shotCamera.fov = focalLengthToVerticalFovDeg(cameraAtTime.focalLengthMm, cameraAtTime.sensorWidthMm, shot.frameAspect);
    r.shotCamera.position.set(cameraAtTime.position.x, cameraAtTime.position.y, cameraAtTime.position.z);
    r.shotCamera.lookAt(cameraAtTime.target.x, cameraAtTime.target.y, cameraAtTime.target.z);
    r.shotCamera.updateProjectionMatrix();
    const helper = new THREE.CameraHelper(r.shotCamera);
    r.cameraHelper = helper;
    r.content.add(helper);

    return () => { cancelled = true; };
  }, [shot]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.renderer.toneMappingExposure = Math.pow(2, shot.exposureEv);
    for (const actor of shot.actors) {
      const group = r.actorObjects.get(actor.id);
      if (!group) continue;
      const transformAtTime = sampleActorTransform(actor, playhead);
      group.position.set(transformAtTime.position.x, transformAtTime.position.y, transformAtTime.position.z);
      group.rotation.set(transformAtTime.rotation.x, transformAtTime.rotation.y, transformAtTime.rotation.z);
      group.scale.set(transformAtTime.scale.x, transformAtTime.scale.y, transformAtTime.scale.z);
    }
    for (const source of shot.lights) {
      const item = r.lights.get(source.id);
      if (!item) continue;
      const l = sampleLight(source, playhead);
      item.light.color.copy(directorLightColor(l));
      item.light.intensity = l.intensity;
      item.light.position.set(l.position.x, l.position.y, l.position.z);
      item.light.castShadow = l.type !== 'area' && l.type !== 'ambient' && l.castShadow;
      if (item.target) item.target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0);
      if (l.type === 'area' && l.target) item.light.lookAt(l.target.x, l.target.y, l.target.z);
      if (item.marker) {
        item.marker.position.set(l.position.x, l.position.y, l.position.z);
        item.marker.traverse((object) => {
          const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
          if (material?.color) material.color.copy(directorLightColor(l));
        });
      }
    }
    const cameraAtTime = sampleCamera(shot.camera, playhead);
    r.shotCamera.aspect = shot.frameAspect;
    r.shotCamera.fov = focalLengthToVerticalFovDeg(cameraAtTime.focalLengthMm, cameraAtTime.sensorWidthMm, shot.frameAspect);
    r.shotCamera.position.set(cameraAtTime.position.x, cameraAtTime.position.y, cameraAtTime.position.z);
    r.shotCamera.lookAt(cameraAtTime.target.x, cameraAtTime.target.y, cameraAtTime.target.z);
    r.shotCamera.updateProjectionMatrix();
    r.cameraHelper?.update();
  }, [playhead, shot]);

  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.transform.detach();
    const selected = selectedObjectId ? r.actorObjects.get(selectedObjectId) ?? r.lightObjects.get(selectedObjectId) : undefined;
    if (selected && viewMode === 'director' && shotEditable) {
      r.transform.camera = r.editorCamera;
      r.transform.attach(selected);
    }
  }, [selectedObjectId, viewMode, shotEditable, characterLoad.loaded]);

  const characterStatus = characterLoad.failed
    ? `开源角色：${characterLoad.loaded}/${characterLoad.total} 已加载 · ${characterLoad.failed} 个失败`
    : characterLoad.loaded === characterLoad.total && characterLoad.total > 0
      ? `${uiZh.characterReady} · ${characterLoad.loaded}/${characterLoad.total} · Quaternius CC0`
      : `${uiZh.loadingCharacter} ${characterLoad.loaded}/${characterLoad.total}`;

  return <div className="viewport-shell">
    <div className="viewport-toolbar">
      <span className="chip">3D 场面调度 / 预演</span>
      <button className={viewMode === 'director' ? 'active' : ''} onClick={() => setViewMode('director')}>导演视图</button>
      <button className={viewMode === 'shot' ? 'active' : ''} onClick={() => setViewMode('shot')}>镜头视图</button>
      <button disabled={!shotEditable} className={shotEditable && transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')} title="W">移动 W</button>
      <button disabled={!shotEditable || selectedIsLight} className={shotEditable && !selectedIsLight && transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')} title="E">旋转 E</button>
      <button disabled={!shotEditable || selectedIsLight} className={shotEditable && !selectedIsLight && transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')} title="R">缩放 R</button>
      <span>{shotEditable ? (selectedIsLight ? '灯具操纵器 · 世界坐标 · 5 厘米吸附' : '5 厘米 · 15° · 5% 吸附') : uiZh.approvedReadonly}</span>
      <span data-character-status>{characterStatus}</span>
      <span className="lens-readout">时间 {playhead.toFixed(2)} 秒 · {sampledCamera.focalLengthMm.toFixed(0)} 毫米 · f/{sampledCamera.aperture} · {shot.frameAspect.toFixed(3)}:1 · 曝光 EV {shot.exposureEv >= 0 ? '+' : ''}{shot.exposureEv.toFixed(1)}</span>
    </div>
    <div className="viewport" ref={mountRef} />
  </div>;
}
