import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useDirectorStore } from '../store/directorStore';
import { usePoseUiStore } from '../store/poseUiStore';
import { fitAspectRect, focalLengthToVerticalFovDeg } from '../utils/math';
import { correlatedColorTemperatureToSrgb } from '../utils/lightColor';
import { sampleActorTransform, sampleCamera, sampleLight } from '../utils/animation';
import type { Actor, DirectorLight } from '../domain/model';
import { humanoidJointIds, rigControlIds, type HumanoidJointId, type RigControlId } from '../domain/humanoidRig';
import { instantiateDirectorCharacter } from '../characters/characterLoader';
import { applyActorRigAtTime, controlPosition, jointDrivenByIk, readAdditiveJointRotation, rigControlToLimb, sampleActorRig } from '../characters/rigRuntime';
import { setActorHeadLookAt, setActorIkPole, setActorIkTarget, setActorJointRotation } from '../store/poseRegistry';
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

type LightRuntime = { light: THREE.Light; marker?: THREE.Group; target?: THREE.Object3D };
type CharacterRuntime = {
  actorId: string;
  anchor: THREE.Group;
  root?: THREE.Group;
  jointMarkers: Map<HumanoidJointId, THREE.Mesh>;
  controlMarkers: Map<RigControlId, THREE.Mesh>;
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
  characters: Map<string, CharacterRuntime>;
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

function rigMarker(color: number, size: number, actorId: string, data: Record<string, unknown>) {
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.92 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), material);
  mesh.renderOrder = 30;
  mesh.userData.actorId = actorId;
  Object.assign(mesh.userData, data);
  return mesh;
}

function installRigMarkers(character: CharacterRuntime, actor: Actor) {
  if (!character.root) return;
  for (const joint of humanoidJointIds) {
    if (!character.root.getObjectByName(joint)) continue;
    const marker = rigMarker(0x5cc8ff, 0.035, actor.id, { rigJointId: joint });
    character.anchor.add(marker);
    character.jointMarkers.set(joint, marker);
  }
  for (const control of rigControlIds) {
    const isPole = control.endsWith('Pole');
    const marker = rigMarker(control === 'headLookAt' ? 0xf5b942 : isPole ? 0xff8a5b : 0x67e8a5, isPole ? 0.045 : 0.055, actor.id, { rigControlId: control });
    character.anchor.add(marker);
    character.controlMarkers.set(control, marker);
  }
}

function updateRigMarkers(character: CharacterRuntime, actor: Actor, rigEditVisible: boolean, selectedControl?: RigControlId, selectedJoint?: HumanoidJointId) {
  if (!character.root) return;
  const rig = sampleActorRig(actor, useDirectorStore.getState().playhead);
  character.anchor.updateWorldMatrix(true, false);
  character.root.updateWorldMatrix(true, true);
  for (const [joint, marker] of character.jointMarkers) {
    const bone = character.root.getObjectByName(joint);
    if (!bone) continue;
    const world = bone.getWorldPosition(new THREE.Vector3());
    marker.position.copy(character.anchor.worldToLocal(world));
    marker.visible = rigEditVisible && !jointDrivenByIk(rig, joint);
    const material = marker.material as THREE.MeshBasicMaterial;
    material.color.setHex(selectedJoint === joint ? 0xffffff : 0x5cc8ff);
  }
  for (const [control, marker] of character.controlMarkers) {
    const limb = rigControlToLimb(control);
    const enabled = control === 'headLookAt' ? rig.headLookAt.enabled : limb ? rig.ik[limb].enabled : false;
    const locked = limb ? rig.ik[limb].locked : false;
    const position = controlPosition(actor, rig, control);
    marker.position.set(position.x, position.y, position.z);
    marker.visible = rigEditVisible && enabled;
    const material = marker.material as THREE.MeshBasicMaterial;
    if (selectedControl === control) material.color.setHex(0xffffff);
    else if (locked) material.color.setHex(0x8b929c);
    else material.color.setHex(control === 'headLookAt' ? 0xf5b942 : control.endsWith('Pole') ? 0xff8a5b : 0x67e8a5);
  }
}

export function DirectorViewport() {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const shotRef = useRef(useDirectorStore.getState().getActiveShot());
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
  const poseEnabled = usePoseUiStore((s) => s.enabled);
  const poseActorId = usePoseUiStore((s) => s.actorId);
  const selectedJoint = usePoseUiStore((s) => s.selectedJoint);
  const selectedControl = usePoseUiStore((s) => s.selectedControl);
  const setPoseEnabled = usePoseUiStore((s) => s.setEnabled);
  const selectRigJoint = usePoseUiStore((s) => s.selectJoint);
  const selectRigControl = usePoseUiStore((s) => s.selectControl);
  const sampledCamera = sampleCamera(shot.camera, playhead);
  const selectedIsLight = shot.lights.some((light) => light.id === selectedObjectId);
  const selectedIsActor = shot.actors.some((actor) => actor.id === selectedObjectId);
  const shotEditable = shot.status !== 'APPROVED';
  const structureKey = useMemo(() => JSON.stringify({
    shot: shot.id,
    actors: shot.actors.map((actor) => [actor.id, actor.name, actor.demographics.sex, actor.demographics.ageGroup, actor.demographics.heightM]),
    lights: shot.lights.map((light) => [light.id, light.type]),
    camera: shot.camera.id,
  }), [shot]);

  shotRef.current = shot;
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { shotAspectRef.current = shot.frameAspect; }, [shot.frameAspect]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (editable || !shotEditable || event.ctrlKey || event.metaKey || event.altKey || poseEnabled) return;
      if (event.key.toLowerCase() === 'w') setTransformMode('translate');
      else if (!selectedIsLight && event.key.toLowerCase() === 'e') setTransformMode('rotate');
      else if (!selectedIsLight && event.key.toLowerCase() === 'r') setTransformMode('scale');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [poseEnabled, setTransformMode, selectedIsLight, shotEditable]);

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
    transform.setTranslationSnap(0.02);
    transform.setRotationSnap(THREE.MathUtils.degToRad(5));
    transform.setScaleSnap(0.05);
    transform.setSize(0.8);
    scene.add(transform.getHelper());

    const grid = new THREE.GridHelper(20, 20, '#45515e', '#2a333d'); scene.add(grid);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#20262d', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -0.002; scene.add(floor);
    const content = new THREE.Group(); scene.add(content);
    const actorObjects = new Map<string, THREE.Group>();
    const characters = new Map<string, CharacterRuntime>();
    const lightObjects = new Map<string, THREE.Group>();
    const lights = new Map<string, LightRuntime>();

    function resize() {
      const w = host.clientWidth || 800, h = host.clientHeight || 500;
      renderer.setSize(w, h, false); editorCamera.aspect = w / h; editorCamera.updateProjectionMatrix();
      shotCamera.aspect = shotAspectRef.current; shotCamera.updateProjectionMatrix();
    }
    resize(); const ro = new ResizeObserver(resize); ro.observe(host);

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const onPointerDown = (ev: PointerEvent) => {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      let localX = ev.clientX - rect.left, localY = ev.clientY - rect.top, targetWidth = rect.width, targetHeight = rect.height;
      if (viewModeRef.current === 'shot') {
        const frame = fitAspectRect(rect.width, rect.height, shotAspectRef.current);
        if (localX < frame.x || localX > frame.x + frame.width || localY < frame.y || localY > frame.y + frame.height) return;
        localX -= frame.x; localY -= frame.y; targetWidth = frame.width; targetHeight = frame.height;
      }
      pointer.x = (localX / targetWidth) * 2 - 1; pointer.y = -(localY / targetHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, viewModeRef.current === 'shot' ? shotCamera : editorCamera);
      const hits = raycaster.intersectObjects(content.children, true);
      const poseHit = hits.find((hit) => hit.object.userData.rigControlId || hit.object.userData.rigJointId);
      const object = (poseHit ?? hits[0])?.object;
      if (!object) return;
      const actorId = object.userData.actorId as string | undefined;
      const rigControlId = object.userData.rigControlId as RigControlId | undefined;
      const rigJointId = object.userData.rigJointId as HumanoidJointId | undefined;
      if (actorId && rigControlId) { selectObject(actorId); selectRigControl(actorId, rigControlId); return; }
      if (actorId && rigJointId) { selectObject(actorId); selectRigJoint(actorId, rigJointId); return; }
      const id = actorId ?? (object.userData.lightId as string | undefined);
      if (id) selectObject(id);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onTransformEnd = () => {
      const object = transform.object;
      if (!object || useDirectorStore.getState().getActiveShot().status === 'APPROVED') return;
      const actorId = object.userData.actorId as string | undefined;
      const control = object.userData.rigControlId as RigControlId | undefined;
      const joint = object.userData.rigJointId as HumanoidJointId | undefined;
      if (actorId && control) {
        const value = { x: object.position.x, y: object.position.y, z: object.position.z };
        if (control === 'headLookAt') setActorHeadLookAt(actorId, value);
        else {
          const limb = rigControlToLimb(control);
          if (!limb) return;
          if (control.endsWith('Pole')) setActorIkPole(actorId, limb, value);
          else setActorIkTarget(actorId, limb, value);
        }
        return;
      }
      if (actorId && joint) { setActorJointRotation(actorId, joint, readAdditiveJointRotation(object, joint)); return; }
      const lightId = object.userData.lightId as string | undefined;
      if (actorId) useDirectorStore.getState().setActorTransform(actorId, { position: { x: object.position.x, y: object.position.y, z: object.position.z }, rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z }, scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z } });
      else if (lightId) useDirectorStore.getState().setLightPosition(lightId, { x: object.position.x, y: object.position.y, z: object.position.z });
    };
    transform.addEventListener('mouseUp', onTransformEnd);

    let raf = 0;
    const animate = () => {
      controls.enabled = viewModeRef.current === 'director' && !transform.dragging;
      controls.update();
      const width = renderer.domElement.clientWidth || 1, height = renderer.domElement.clientHeight || 1;
      renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.setClearColor(0x080b0f, 1); renderer.clear(true, true, true);
      if (viewModeRef.current === 'shot') {
        const frame = fitAspectRect(width, height, shotAspectRef.current); const bottom = height - frame.y - frame.height;
        renderer.setViewport(frame.x, bottom, frame.width, frame.height); renderer.setScissor(frame.x, bottom, frame.width, frame.height); renderer.setScissorTest(true); renderer.setClearColor(0x14181e, 1); renderer.clear(true, true, true); renderer.render(scene, shotCamera); renderer.setScissorTest(false);
      } else { renderer.setClearColor(0x14181e, 1); renderer.clear(true, true, true); renderer.render(scene, editorCamera); }
      raf = requestAnimationFrame(animate);
    };
    animate();
    runtime.current = { scene, renderer, editorCamera, shotCamera, controls, transform, content, actorObjects, characters, lightObjects, lights, raf };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener('pointerdown', onPointerDown); transform.removeEventListener('mouseUp', onTransformEnd); transform.detach(); transform.dispose(); controls.dispose(); disposeSceneContent(content); floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement); runtime.current = null;
    };
  }, [selectObject, selectRigControl, selectRigJoint]);

  useEffect(() => {
    const r = runtime.current; if (!r) return;
    let cancelled = false;
    r.transform.detach(); disposeSceneContent(r.content); r.content.clear(); r.actorObjects.clear(); r.characters.clear(); r.lightObjects.clear(); r.lights.clear(); r.cameraHelper = undefined;
    const currentShot = useDirectorStore.getState().getActiveShot();
    const time = useDirectorStore.getState().playhead;
    setCharacterLoad({ loaded: 0, total: currentShot.actors.length, failed: 0 });
    for (const actor of currentShot.actors) {
      const anchor = new THREE.Group(); anchor.name = actor.name; anchor.userData.actorId = actor.id;
      const transformAtTime = sampleActorTransform(actor, time); anchor.position.set(transformAtTime.position.x, transformAtTime.position.y, transformAtTime.position.z); anchor.rotation.set(transformAtTime.rotation.x, transformAtTime.rotation.y, transformAtTime.rotation.z); anchor.scale.set(transformAtTime.scale.x, transformAtTime.scale.y, transformAtTime.scale.z);
      r.content.add(anchor); r.actorObjects.set(actor.id, anchor);
      const character: CharacterRuntime = { actorId: actor.id, anchor, jointMarkers: new Map(), controlMarkers: new Map() }; r.characters.set(actor.id, character);
      void instantiateDirectorCharacter(actor).then(({ root }) => {
        if (cancelled || runtime.current !== r || r.actorObjects.get(actor.id) !== anchor) { disposeSceneContent(root); return; }
        character.root = root; anchor.add(root); applyActorRigAtTime(root, actor, useDirectorStore.getState().playhead); installRigMarkers(character, actor); updateRigMarkers(character, actor, usePoseUiStore.getState().enabled && usePoseUiStore.getState().actorId === actor.id, usePoseUiStore.getState().selectedControl, usePoseUiStore.getState().selectedJoint); setCharacterLoad((state) => ({ ...state, loaded: state.loaded + 1 }));
      }).catch((error) => { console.error(`角色 ${actor.name} 加载失败`, error); if (!cancelled) setCharacterLoad((state) => ({ ...state, failed: state.failed + 1 })); });
    }
    for (const source of currentShot.lights) {
      const l = sampleLight(source, time); const color = directorLightColor(l); let light: THREE.Light; let target: THREE.Object3D | undefined;
      if (l.type === 'ambient') light = new THREE.AmbientLight(color, l.intensity);
      else if (l.type === 'point') light = new THREE.PointLight(color, l.intensity, 0, 2);
      else if (l.type === 'spot') { const spot = new THREE.SpotLight(color, l.intensity, 0, Math.PI / 5, 0.4, 2); target = spot.target; target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0); r.content.add(target); light = spot; }
      else if (l.type === 'area') light = new THREE.RectAreaLight(color, l.intensity, 2, 1);
      else { const directional = new THREE.DirectionalLight(color, l.intensity); target = directional.target; target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0); r.content.add(target); light = directional; }
      light.position.set(l.position.x, l.position.y, l.position.z); if (l.type === 'area' && l.target) light.lookAt(l.target.x, l.target.y, l.target.z); light.castShadow = l.type !== 'area' && l.type !== 'ambient' && l.castShadow; r.content.add(light);
      let marker: THREE.Group | undefined; if (l.type !== 'ambient') { marker = buildLightMarker(l, color); r.content.add(marker); r.lightObjects.set(source.id, marker); } r.lights.set(source.id, { light, marker, target });
    }
    const cameraAtTime = sampleCamera(currentShot.camera, time); r.shotCamera.aspect = currentShot.frameAspect; r.shotCamera.fov = focalLengthToVerticalFovDeg(cameraAtTime.focalLengthMm, cameraAtTime.sensorWidthMm, currentShot.frameAspect); r.shotCamera.position.set(cameraAtTime.position.x, cameraAtTime.position.y, cameraAtTime.position.z); r.shotCamera.lookAt(cameraAtTime.target.x, cameraAtTime.target.y, cameraAtTime.target.z); r.shotCamera.updateProjectionMatrix(); const helper = new THREE.CameraHelper(r.shotCamera); r.cameraHelper = helper; r.content.add(helper);
    return () => { cancelled = true; };
  }, [structureKey]);

  useEffect(() => {
    const r = runtime.current; if (!r) return;
    r.renderer.toneMappingExposure = Math.pow(2, shot.exposureEv);
    for (const actor of shot.actors) {
      const character = r.characters.get(actor.id); if (!character) continue;
      const transformAtTime = sampleActorTransform(actor, playhead); character.anchor.position.set(transformAtTime.position.x, transformAtTime.position.y, transformAtTime.position.z); character.anchor.rotation.set(transformAtTime.rotation.x, transformAtTime.rotation.y, transformAtTime.rotation.z); character.anchor.scale.set(transformAtTime.scale.x, transformAtTime.scale.y, transformAtTime.scale.z);
      if (character.root) applyActorRigAtTime(character.root, actor, playhead);
      updateRigMarkers(character, actor, poseEnabled && poseActorId === actor.id && viewMode === 'director', selectedControl, selectedJoint);
    }
    for (const source of shot.lights) {
      const item = r.lights.get(source.id); if (!item) continue; const l = sampleLight(source, playhead); item.light.color.copy(directorLightColor(l)); item.light.intensity = l.intensity; item.light.position.set(l.position.x, l.position.y, l.position.z); item.light.castShadow = l.type !== 'area' && l.type !== 'ambient' && l.castShadow; if (item.target) item.target.position.set(l.target?.x ?? 0, l.target?.y ?? 1, l.target?.z ?? 0); if (l.type === 'area' && l.target) item.light.lookAt(l.target.x, l.target.y, l.target.z); if (item.marker) { item.marker.position.set(l.position.x, l.position.y, l.position.z); item.marker.traverse((object) => { const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (material?.color) material.color.copy(directorLightColor(l)); }); }
    }
    const cameraAtTime = sampleCamera(shot.camera, playhead); r.shotCamera.aspect = shot.frameAspect; r.shotCamera.fov = focalLengthToVerticalFovDeg(cameraAtTime.focalLengthMm, cameraAtTime.sensorWidthMm, shot.frameAspect); r.shotCamera.position.set(cameraAtTime.position.x, cameraAtTime.position.y, cameraAtTime.position.z); r.shotCamera.lookAt(cameraAtTime.target.x, cameraAtTime.target.y, cameraAtTime.target.z); r.shotCamera.updateProjectionMatrix(); r.cameraHelper?.update();
  }, [playhead, poseActorId, poseEnabled, selectedControl, selectedJoint, shot, viewMode]);

  useEffect(() => {
    const r = runtime.current; if (!r) return;
    r.transform.detach();
    if (viewMode !== 'director' || !shotEditable) return;
    if (poseEnabled && poseActorId) {
      const character = r.characters.get(poseActorId); const actor = shot.actors.find((item) => item.id === poseActorId); if (!character || !actor) return;
      const rig = sampleActorRig(actor, playhead);
      if (selectedControl) {
        const marker = character.controlMarkers.get(selectedControl); const limb = rigControlToLimb(selectedControl); const locked = limb ? rig.ik[limb].locked : false;
        if (marker && marker.visible && !locked) { r.transform.camera = r.editorCamera; r.transform.setMode('translate'); r.transform.setSpace('local'); r.transform.attach(marker); }
        return;
      }
      if (selectedJoint && character.root && !jointDrivenByIk(rig, selectedJoint)) {
        const bone = character.root.getObjectByName(selectedJoint); if (bone) { bone.userData.actorId = poseActorId; bone.userData.rigJointId = selectedJoint; r.transform.camera = r.editorCamera; r.transform.setMode('rotate'); r.transform.setSpace('local'); r.transform.attach(bone); }
      }
      return;
    }
    const selected = selectedObjectId ? r.actorObjects.get(selectedObjectId) ?? r.lightObjects.get(selectedObjectId) : undefined;
    if (selected) { r.transform.camera = r.editorCamera; r.transform.setMode(selectedIsLight ? 'translate' : transformMode); r.transform.setSpace(selectedIsLight || transformMode === 'translate' ? 'world' : 'local'); r.transform.attach(selected); }
  }, [characterLoad.loaded, playhead, poseActorId, poseEnabled, selectedControl, selectedIsLight, selectedJoint, selectedObjectId, shot, shotEditable, transformMode, viewMode]);

  const characterStatus = characterLoad.failed ? `开源角色：${characterLoad.loaded}/${characterLoad.total} 已加载 · ${characterLoad.failed} 个失败` : characterLoad.loaded === characterLoad.total && characterLoad.total > 0 ? `${uiZh.characterReady} · ${characterLoad.loaded}/${characterLoad.total} · Quaternius CC0` : `${uiZh.loadingCharacter} ${characterLoad.loaded}/${characterLoad.total}`;
  return <div className="viewport-shell">
    <div className="viewport-toolbar">
      <span className="chip">3D 场面调度 / 预演</span>
      <button className={viewMode === 'director' ? 'active' : ''} onClick={() => setViewMode('director')}>导演视图</button>
      <button className={viewMode === 'shot' ? 'active' : ''} onClick={() => setViewMode('shot')}>镜头视图</button>
      <button disabled={!shotEditable || !selectedIsActor || viewMode !== 'director'} className={poseEnabled && poseActorId === selectedObjectId ? 'active' : ''} onClick={() => selectedObjectId && setPoseEnabled(!(poseEnabled && poseActorId === selectedObjectId), selectedObjectId)}>{poseEnabled && poseActorId === selectedObjectId ? '退出人物调姿' : '人物调姿'}</button>
      {!poseEnabled && <><button disabled={!shotEditable} className={shotEditable && transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')} title="W">移动 W</button><button disabled={!shotEditable || selectedIsLight} className={shotEditable && !selectedIsLight && transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')} title="E">旋转 E</button><button disabled={!shotEditable || selectedIsLight} className={shotEditable && !selectedIsLight && transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')} title="R">缩放 R</button></>}
      <span>{poseEnabled ? '调姿：蓝色=FK关节 · 绿色=IK目标 · 橙色=肘膝方向 · 黄色=注视目标' : shotEditable ? (selectedIsLight ? '灯具操纵器 · 世界坐标 · 5 厘米吸附' : '5 厘米 · 15° · 5% 吸附') : uiZh.approvedReadonly}</span>
      <span data-character-status>{characterStatus}</span>
      <span className="lens-readout">时间 {playhead.toFixed(2)} 秒 · {sampledCamera.focalLengthMm.toFixed(0)} 毫米 · f/{sampledCamera.aperture} · {shot.frameAspect.toFixed(3)}:1 · 曝光 EV {shot.exposureEv >= 0 ? '+' : ''}{shot.exposureEv.toFixed(1)}</span>
    </div>
    <div className="viewport" ref={mountRef} />
  </div>;
}
