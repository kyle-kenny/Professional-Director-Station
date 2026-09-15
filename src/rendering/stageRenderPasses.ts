import * as THREE from 'three';
import type { Shot } from '../domain/model';
import { instantiateDirectorCharacter, disposeCharacterInstance } from '../characters/characterLoader';
import { instantiateStageAsset, disposeStageAssetInstance } from '../assets/stageAssetLoader';
import { applyActorRigAtTime } from '../characters/rigRuntime';
import { sampleActorTransform, sampleCamera } from '../utils/animation';
import { focalLengthToVerticalFovDeg } from '../utils/math';
import { canonicalJson, sha256Bytes, sha256Text } from '../utils/sha256';

export const stageRenderPassKinds = ['sceneDepth', 'sceneNormal', 'sceneMask', 'sceneEdge'] as const;
export type StageRenderPassKind = typeof stageRenderPassKinds[number];

export type StageRenderPassImage = {
  kind: StageRenderPassKind;
  mimeType: 'image/png';
  width: number;
  height: number;
  dataBase64: string;
  contentHashSha256: string;
};

export type StageRenderPassBundle = {
  schema: 'pds-stage-render-passes-1';
  shotId: string;
  frame: number;
  width: number;
  height: number;
  bundleHashSha256: string;
  passes: Record<StageRenderPassKind, StageRenderPassImage>;
};

type CanvasSnapshot = { base64: string; pixels: Uint8ClampedArray };

const clampDimension = (value: number) => Math.max(64, Math.min(4096, Math.round(value)));

function deterministicMaskColor(id: string) {
  const hash = sha256Text(id);
  const channel = (offset: number) => 72 + (Number.parseInt(hash.slice(offset, offset + 2), 16) % 168);
  return new THREE.Color(channel(0) / 255, channel(2) / 255, channel(4) / 255);
}

function hideNonRenderGeometry(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object.userData.selectionProxy || object.userData.rigControlId || object.userData.rigJointId) object.visible = false;
  });
}

function snapshotRenderer(renderer: THREE.WebGLRenderer, width: number, height: number): CanvasSnapshot {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Stage render-pass capture requires a 2D canvas context.');
  context.drawImage(renderer.domElement, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Stage render-pass PNG encoding failed.');
  return { base64: dataUrl.slice(comma + 1), pixels: new Uint8ClampedArray(pixels) };
}

export function buildSceneEdgePixels(depth: Uint8ClampedArray, normal: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  if (depth.length !== width * height * 4 || normal.length !== depth.length) throw new Error('Stage edge inputs do not match the requested dimensions.');
  const output = new Uint8ClampedArray(depth.length);
  const pixelScore = (index: number, other: number) => {
    const depthDelta = Math.abs(depth[index] - depth[other]);
    const normalDelta = Math.abs(normal[index] - normal[other]) + Math.abs(normal[index + 1] - normal[other + 1]) + Math.abs(normal[index + 2] - normal[other + 2]);
    return depthDelta * 1.8 + normalDelta * 0.55;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const right = (y * width + Math.min(width - 1, x + 1)) * 4;
      const down = (Math.min(height - 1, y + 1) * width + x) * 4;
      const score = Math.max(pixelScore(index, right), pixelScore(index, down));
      const value = score <= 18 ? 0 : Math.min(255, Math.round((score - 18) * 3.2));
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
      output[index + 3] = 255;
    }
  }
  return output;
}

function encodePixelsAsPngBase64(pixels: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Stage edge PNG encoding requires a 2D canvas context.');
  const safePixels = new Uint8ClampedArray(new ArrayBuffer(pixels.byteLength));
  safePixels.set(pixels);
  context.putImageData(new ImageData(safePixels, width, height), 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function passImage(kind: StageRenderPassKind, base64: string, width: number, height: number): StageRenderPassImage {
  return { kind, mimeType: 'image/png', width, height, dataBase64: base64, contentHashSha256: sha256Bytes(bytesFromBase64(base64)) };
}

function replaceWithMaskMaterials(scene: THREE.Scene) {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const temporary: THREE.Material[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || object.userData.selectionProxy) return;
    originals.set(mesh, mesh.material);
    const actorId = String(object.userData.actorId ?? '').trim();
    const stageAssetId = String(object.userData.stageAssetId ?? '').trim();
    const entityId = actorId || stageAssetId;
    const color = entityId ? deterministicMaskColor(entityId) : object.userData.stageGround ? new THREE.Color(0.22, 0.22, 0.22) : new THREE.Color(0.85, 0.85, 0.85);
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false });
    temporary.push(material);
    mesh.material = material;
  });
  return () => {
    for (const [mesh, material] of originals) mesh.material = material;
    temporary.forEach((material) => material.dispose());
  };
}

export async function captureStageRenderPasses(shot: Shot, requestedFrame: number, requestedWidth: number, requestedHeight: number): Promise<StageRenderPassBundle> {
  if (typeof document === 'undefined') throw new Error('Full Stage render passes require a browser WebGL environment.');
  const width = clampDimension(requestedWidth);
  const height = clampDimension(requestedHeight);
  const totalFrames = Math.max(0, Math.round(shot.duration * shot.fps));
  const frame = Math.max(0, Math.min(totalFrames, Math.round(requestedFrame)));
  const time = frame / shot.fps;
  const sampledCamera = sampleCamera(shot.camera, time);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(
    focalLengthToVerticalFovDeg(sampledCamera.focalLengthMm, sampledCamera.sensorWidthMm, shot.frameAspect),
    shot.frameAspect,
    0.01,
    500,
  );
  camera.position.set(sampledCamera.position.x, sampledCamera.position.y, sampledCamera.position.z);
  camera.lookAt(sampledCamera.target.x, sampledCamera.target.y, sampledCamera.target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.userData.stageGround = true;
  scene.add(floor);

  const characterRoots: THREE.Group[] = [];
  const stageAssetRoots: THREE.Group[] = [];
  try {
    await Promise.all(shot.actors.map(async (actor) => {
      const transform = sampleActorTransform(actor, time);
      const anchor = new THREE.Group();
      anchor.name = actor.name;
      anchor.userData.actorId = actor.id;
      anchor.position.set(transform.position.x, transform.position.y, transform.position.z);
      anchor.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
      anchor.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
      const { root } = await instantiateDirectorCharacter(actor);
      hideNonRenderGeometry(root);
      applyActorRigAtTime(root, actor, time);
      anchor.add(root);
      characterRoots.push(root);
      scene.add(anchor);
    }));

    await Promise.all(shot.stageAssets.filter((instance) => instance.visible).map(async (instance) => {
      const { root } = await instantiateStageAsset(instance);
      stageAssetRoots.push(root);
      scene.add(root);
    }));

    scene.updateMatrixWorld(true);

    const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide });
    depthMaterial.toneMapped = false;
    scene.overrideMaterial = depthMaterial;
    renderer.render(scene, camera);
    const depth = snapshotRenderer(renderer, width, height);

    const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    normalMaterial.toneMapped = false;
    scene.overrideMaterial = normalMaterial;
    renderer.render(scene, camera);
    const normal = snapshotRenderer(renderer, width, height);

    scene.overrideMaterial = null;
    const restoreMaskMaterials = replaceWithMaskMaterials(scene);
    renderer.render(scene, camera);
    const mask = snapshotRenderer(renderer, width, height);
    restoreMaskMaterials();

    const edgePixels = buildSceneEdgePixels(depth.pixels, normal.pixels, width, height);
    const edgeBase64 = encodePixelsAsPngBase64(edgePixels, width, height);
    const passes: Record<StageRenderPassKind, StageRenderPassImage> = {
      sceneDepth: passImage('sceneDepth', depth.base64, width, height),
      sceneNormal: passImage('sceneNormal', normal.base64, width, height),
      sceneMask: passImage('sceneMask', mask.base64, width, height),
      sceneEdge: passImage('sceneEdge', edgeBase64, width, height),
    };
    const bundleHashSha256 = sha256Text(canonicalJson({
      shotId: shot.id,
      frame,
      width,
      height,
      stageAssets: shot.stageAssets.filter((item) => item.visible).map((item) => ({ id: item.id, asset: `${item.asset.id}@${item.asset.version}`, transform: item.transform })),
      hashes: Object.fromEntries(stageRenderPassKinds.map((kind) => [kind, passes[kind].contentHashSha256])),
    }));
    depthMaterial.dispose();
    normalMaterial.dispose();
    return { schema: 'pds-stage-render-passes-1', shotId: shot.id, frame, width, height, bundleHashSha256, passes };
  } finally {
    scene.overrideMaterial = null;
    characterRoots.forEach((root) => disposeCharacterInstance(root));
    stageAssetRoots.forEach((root) => disposeStageAssetInstance(root));
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
    renderer.dispose();
  }
}