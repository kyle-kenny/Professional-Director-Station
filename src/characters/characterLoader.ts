import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Actor } from '../domain/model';
import { characterAgeTreatment, characterModelUrl, resolveOpenCharacter, type OpenCharacterDescriptor } from './characterCatalog';
import { captureNeutralRigBase } from './rigRuntime';

const loader = new GLTFLoader();
const templateCache = new Map<string, Promise<THREE.Group>>();

function loadTemplate(url: string) {
  let request = templateCache.get(url);
  if (!request) {
    request = loader.loadAsync(url).then((gltf) => gltf.scene);
    templateCache.set(url, request);
  }
  return request;
}

function cloneInstanceMaterials(root: THREE.Object3D, actorId: string) {
  root.traverse((object) => {
    object.userData.actorId = actorId;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((material) => material.clone());
    else if (mesh.material) mesh.material = mesh.material.clone();
    object.userData.sharedCharacterGeometry = true;
  });
}

function normalizeToActorHeight(model: THREE.Group, targetHeightM: number) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!Number.isFinite(size.y) || size.y <= 1e-6) throw new Error('角色模型缺少有效的人体高度包围盒。');
  const scale = targetHeightM / size.y;
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
}

function applyAgeTreatment(model: THREE.Group, actor: Actor) {
  const treatment = characterAgeTreatment(actor);
  if (treatment.posturePitchRad) {
    const spine = model.getObjectByName('spine_01');
    if (spine) spine.rotateX(treatment.posturePitchRad);
  }
  if (actor.demographics.ageGroup === 'elderly') {
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        if (material.name.toLowerCase().includes('hair') && 'color' in material) {
          (material as THREE.MeshStandardMaterial).color.set('#b7b3aa');
        }
      }
    });
  }
}

/**
 * Invisible, raycastable selection volume around the real skinned character.
 * The visible character remains the CC0 SkinnedMesh; this only makes viewport picking
 * forgiving around gaps between limbs/clothing, like selection proxies in DCC tools.
 */
function buildCharacterSelectionProxy(actor: Actor) {
  const width = Math.max(0.48, actor.demographics.shoulderWidthM * 1.45);
  const height = Math.max(0.5, actor.demographics.heightM * 0.96);
  const depth = Math.max(0.38, actor.demographics.bodyDepthM * 1.9);
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  material.colorWrite = false;
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  proxy.name = `选择代理 · ${actor.name}`;
  proxy.position.y = height * 0.5;
  proxy.userData.actorId = actor.id;
  proxy.userData.selectionProxy = true;
  proxy.castShadow = false;
  proxy.receiveShadow = false;
  return proxy;
}

export type DirectorCharacterInstance = {
  root: THREE.Group;
  descriptor: OpenCharacterDescriptor;
};

/**
 * Instantiate a real skinned CC0 character in its neutral/age-treated bind posture.
 * All director FK/IK posing is applied afterwards by rigRuntime so pose changes do not reload geometry.
 */
export async function instantiateDirectorCharacter(actor: Actor): Promise<DirectorCharacterInstance> {
  const descriptor = resolveOpenCharacter(actor);
  const template = await loadTemplate(characterModelUrl(descriptor));
  const model = cloneSkeleton(template) as THREE.Group;
  cloneInstanceMaterials(model, actor.id);
  normalizeToActorHeight(model, actor.demographics.heightM);
  applyAgeTreatment(model, actor);
  captureNeutralRigBase(model);

  const root = new THREE.Group();
  root.name = actor.name;
  root.userData.actorId = actor.id;
  root.userData.characterSource = 'quaternius-cc0';
  root.userData.characterVariant = descriptor.id;
  root.add(model);
  root.add(buildCharacterSelectionProxy(actor));
  return { root, descriptor };
}

export function disposeCharacterInstance(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
    if (mesh.geometry && !object.userData.sharedCharacterGeometry) mesh.geometry.dispose();
    // Imported CC0 geometry belongs to the cached template and remains shared.
  });
}
