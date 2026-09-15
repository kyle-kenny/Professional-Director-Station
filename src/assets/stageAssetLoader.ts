import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetRef, StageAssetInstance } from '../domain/model';
import { getAssetBinary } from '../storage/assetBinaryStore';
import { sha256Bytes } from '../utils/sha256';

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const templateCache = new Map<string, Promise<THREE.Group>>();

function cacheKey(asset: AssetRef) {
  return `${asset.id}@${asset.version}:${asset.contentHashSha256 ?? 'unhashed'}`;
}

function verifyBinary(asset: AssetRef, bytes: ArrayBuffer) {
  if (asset.sourceSizeBytes !== undefined && bytes.byteLength !== asset.sourceSizeBytes) {
    throw new Error(`Stage 资产 ${asset.id}@${asset.version} 缓存长度与登记值不一致。`);
  }
  if (asset.contentHashSha256) {
    const actual = sha256Bytes(new Uint8Array(bytes));
    if (actual !== asset.contentHashSha256) throw new Error(`Stage 资产 ${asset.id}@${asset.version} SHA-256 校验失败。`);
  }
}

async function parseTemplate(asset: AssetRef): Promise<THREE.Group> {
  const stored = await getAssetBinary(asset.id, asset.version);
  if (!stored) throw new Error(`Stage 资产 ${asset.id}@${asset.version} 的本地二进制缓存缺失。请在资产库重新导入原文件。`);
  verifyBinary(asset, stored.bytes);

  let parsed: THREE.Group;
  if (asset.sourceFormat === 'glb') {
    const gltf = await gltfLoader.parseAsync(stored.bytes.slice(0), '');
    parsed = gltf.scene;
  } else if (asset.sourceFormat === 'fbx') {
    parsed = fbxLoader.parse(stored.bytes.slice(0), '');
    const sourceUnitScaleMeters = asset.sourceUnitScaleMeters ?? 1;
    parsed.scale.multiplyScalar(sourceUnitScaleMeters);
  } else {
    throw new Error(`Stage 资产 ${asset.id}@${asset.version} 缺少受支持的 GLB / FBX sourceFormat。`);
  }

  parsed.updateMatrixWorld(true);
  return parsed;
}

function loadTemplate(asset: AssetRef) {
  const key = cacheKey(asset);
  let request = templateCache.get(key);
  if (!request) {
    request = parseTemplate(asset).catch((error) => {
      templateCache.delete(key);
      throw error;
    });
    templateCache.set(key, request);
  }
  return request;
}

function cloneInstanceMaterials(root: THREE.Object3D, instance: StageAssetInstance) {
  root.traverse((object) => {
    object.userData.stageAssetId = instance.id;
    object.userData.stageAssetKind = instance.kind;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    mesh.castShadow = instance.castShadow;
    mesh.receiveShadow = instance.receiveShadow;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((material) => material.clone());
    else if (mesh.material) mesh.material = mesh.material.clone();
    object.userData.sharedStageAssetGeometry = true;
  });
}

export type StageAssetRuntimeInstance = {
  root: THREE.Group;
  model: THREE.Group;
};

export async function instantiateStageAsset(instance: StageAssetInstance): Promise<StageAssetRuntimeInstance> {
  const template = await loadTemplate(instance.asset);
  const model = cloneSkeleton(template) as THREE.Group;
  cloneInstanceMaterials(model, instance);

  const root = new THREE.Group();
  root.name = instance.name;
  root.userData.stageAssetId = instance.id;
  root.userData.stageAssetKind = instance.kind;
  root.position.set(instance.transform.position.x, instance.transform.position.y, instance.transform.position.z);
  root.rotation.set(instance.transform.rotation.x, instance.transform.rotation.y, instance.transform.rotation.z);
  root.scale.set(instance.transform.scale.x, instance.transform.scale.y, instance.transform.scale.z);
  root.visible = instance.visible;
  root.add(model);
  return { root, model };
}

export function applyStageAssetInstanceState(root: THREE.Group, instance: StageAssetInstance) {
  root.position.set(instance.transform.position.x, instance.transform.position.y, instance.transform.position.z);
  root.rotation.set(instance.transform.rotation.x, instance.transform.rotation.y, instance.transform.rotation.z);
  root.scale.set(instance.transform.scale.x, instance.transform.scale.y, instance.transform.scale.z);
  root.visible = instance.visible;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    mesh.castShadow = instance.castShadow;
    mesh.receiveShadow = instance.receiveShadow;
  });
}

export function disposeStageAssetInstance(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
    if (mesh.geometry && !object.userData.sharedStageAssetGeometry) mesh.geometry.dispose();
  });
}

export function clearStageAssetTemplateCache() {
  templateCache.clear();
}
