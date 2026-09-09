import * as THREE from 'three';
import type { CameraKeyframe, DirectorLight, ShotCamera, Vec3 } from '../domain/model';

export const cameraKeyframeSelectionId = (time: number) => `camera-keyframe:${time.toFixed(6)}`;

export function parseCameraKeyframeSelectionId(id?: string) {
  if (!id?.startsWith('camera-keyframe:')) return undefined;
  const time = Number(id.slice('camera-keyframe:'.length));
  return Number.isFinite(time) ? time : undefined;
}

export type SceneEntityData = {
  actorId?: string;
  lightId?: string;
  cameraId?: string;
  cameraKeyframeId?: string;
  rigJointId?: string;
  rigControlId?: string;
};

export function resolveSceneEntityData(object?: THREE.Object3D | null): SceneEntityData {
  let current = object ?? undefined;
  while (current) {
    const data = current.userData as SceneEntityData;
    const hiddenRigControl = current.visible === false && Boolean(data.rigJointId || data.rigControlId);
    if (hiddenRigControl && data.actorId) return { actorId: data.actorId };
    if (!hiddenRigControl && (data.actorId || data.lightId || data.cameraId || data.cameraKeyframeId || data.rigJointId || data.rigControlId)) return data;
    current = current.parent ?? undefined;
  }
  return {};
}

function metal(color = 0x252c35) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.72 });
}

function dark(color = 0x0d1117) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.55 });
}

function luminous(color: THREE.Color, intensity = 1.7) {
  return new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.66),
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.2,
    metalness: 0.04,
  });
}

function applyEntityData<T extends THREE.Object3D>(root: T, data: SceneEntityData & { entityKind?: string }): T {
  Object.assign(root.userData, data, { sceneEntity: true });
  root.traverse((object) => Object.assign(object.userData, data, { sceneEntity: true }));
  return root;
}

function addSelectionHalo(group: THREE.Group, radius: number, y: number) {
  const material = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9, depthTest: false });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 36), material);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = y;
  halo.visible = false;
  halo.renderOrder = 40;
  halo.userData.selectionHalo = true;
  group.add(halo);
}

export function setSceneEntitySelected(group: THREE.Object3D | undefined, selected: boolean) {
  if (!group) return;
  group.traverse((object) => {
    if (object.userData.selectionHalo) object.visible = selected;
  });
}

function addTripod(group: THREE.Group, y = -0.24) {
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.09, 12), metal(0x171c23));
  hub.position.y = y;
  group.add(hub);
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.58, 8), metal(0x202732));
    leg.position.set(Math.cos(angle) * 0.14, y - 0.28, Math.sin(angle) * 0.14);
    leg.rotation.z = Math.cos(angle) * 0.26;
    leg.rotation.x = Math.sin(angle) * 0.26;
    group.add(leg);
  }
}

/** The entity's optical axis is always local -Z, matching THREE.Camera. */
export function buildCameraEntity(options: { id: string; name: string; ghost?: boolean; scale?: number }) {
  const group = new THREE.Group();
  group.name = options.name;
  const ghost = options.ghost ?? false;
  const body = ghost
    ? new THREE.MeshStandardMaterial({ color: 0x6683a0, transparent: true, opacity: 0.32, roughness: 0.45, metalness: 0.3, depthWrite: false })
    : metal(0x202833);
  const lensMaterial = ghost
    ? new THREE.MeshStandardMaterial({ color: 0x8fc6ee, transparent: true, opacity: 0.42, roughness: 0.25, metalness: 0.2, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x0b1722, emissive: 0x0b385e, emissiveIntensity: 0.85, roughness: 0.16, metalness: 0.5 });

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.54), body);
  bodyMesh.position.z = 0.02;
  group.add(bodyMesh);

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.27), body.clone());
  top.position.set(0, 0.2, 0.04);
  group.add(top);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.055, 0.2), dark(0x121820));
  handle.position.set(0, 0.31, 0.02);
  group.add(handle);

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.135, 0.32, 20), lensMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.39;
  group.add(lens);

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.115, 0.13, 20, 1, true), dark(0x090d12));
  hood.rotation.x = Math.PI / 2;
  hood.position.z = -0.60;
  group.add(hood);

  const matte = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.26, 0.045), dark(0x070a0e));
  matte.position.z = -0.68;
  group.add(matte);

  const tally = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.028), new THREE.MeshStandardMaterial({ color: 0x441010, emissive: 0xff3030, emissiveIntensity: ghost ? 0.25 : 2 }));
  tally.position.set(0.17, 0.14, -0.05);
  group.add(tally);

  addTripod(group);
  addSelectionHalo(group, 0.38, -0.79);
  group.scale.setScalar(options.scale ?? 1);

  const data = options.id.startsWith('camera-keyframe:')
    ? { cameraKeyframeId: options.id, entityKind: 'camera-keyframe' }
    : { cameraId: options.id, entityKind: 'camera' };
  return applyEntityData(group, data);
}

function addStand(group: THREE.Group) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.72, 10), metal(0x1a2028));
  pole.position.y = -0.5;
  group.add(pole);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 12), dark(0x11161d));
  collar.position.y = -0.15;
  group.add(collar);
}

function addBarnDoors(group: THREE.Group) {
  const material = dark(0x101318);
  const geometry = new THREE.BoxGeometry(0.23, 0.17, 0.022);
  const placements: Array<[number, number, number, number, number]> = [
    [-0.21, 0, -0.3, 0, 0.62], [0.21, 0, -0.3, 0, -0.62],
    [0, 0.16, -0.3, 0.62, 0], [0, -0.16, -0.3, -0.62, 0],
  ];
  for (const [x, y, z, rx, ry] of placements) {
    const door = new THREE.Mesh(geometry, material);
    door.position.set(x, y, z);
    door.rotation.x = rx;
    door.rotation.y = ry;
    group.add(door);
  }
}

export function buildLightEntity(light: DirectorLight, color: THREE.Color) {
  const group = new THREE.Group();
  group.name = `灯具实体 · ${light.name}`;
  const lightMaterial = luminous(color);

  if (light.type === 'area') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.46, 0.095), metal(0x202733));
    group.add(shell);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), lightMaterial);
    panel.position.z = -0.051;
    panel.rotation.y = Math.PI;
    panel.userData.lightEmitter = true;
    group.add(panel);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 24, Math.PI), metal(0x171d25));
    yoke.rotation.z = Math.PI / 2;
    yoke.position.z = 0.06;
    group.add(yoke);
    addStand(group);
  } else if (light.type === 'spot' || light.type === 'directional') {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.42, 20), metal(0x252d37));
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.03;
    group.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.175, 24), lightMaterial);
    lens.position.z = -0.245;
    lens.rotation.y = Math.PI;
    lens.userData.lightEmitter = true;
    group.add(lens);
    addBarnDoors(group);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 8, 24, Math.PI), metal(0x141a21));
    yoke.rotation.z = Math.PI / 2;
    yoke.position.z = 0.02;
    group.add(yoke);
    addStand(group);
    if (light.type === 'directional') {
      const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xffcf57, transparent: true, opacity: 0.78 });
      for (const x of [-0.12, 0, 0.12]) {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), arrowMaterial);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(x, 0.28, -0.3);
        group.add(shaft);
      }
    }
  } else if (light.type === 'point') {
    const cage = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 10), new THREE.MeshStandardMaterial({ color: 0x2b3138, wireframe: true, roughness: 0.6, metalness: 0.5 }));
    group.add(cage);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), lightMaterial);
    bulb.userData.lightEmitter = true;
    group.add(bulb);
    addStand(group);
  } else {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12), new THREE.MeshStandardMaterial({ color: 0x4a6d8c, transparent: true, opacity: 0.55, emissive: color, emissiveIntensity: 0.7, roughness: 0.5 }));
    group.add(dome);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 32), metal(0x293540));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  addSelectionHalo(group, light.type === 'area' ? 0.48 : 0.34, light.type === 'ambient' ? -0.32 : -0.88);
  return applyEntityData(group, { lightId: light.id, entityKind: `light-${light.type}` });
}

export function orientMinusZToTarget(object: THREE.Object3D, position: Vec3, target?: Vec3) {
  object.position.set(position.x, position.y, position.z);
  if (!target) return;
  const direction = new THREE.Vector3(target.x - position.x, target.y - position.y, target.z - position.z);
  if (direction.lengthSq() < 1e-10) return;
  direction.normalize();
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
}

export function targetFromMinusZEntity(object: THREE.Object3D, distance: number): Vec3 {
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(object.quaternion).normalize();
  return {
    x: object.position.x + direction.x * distance,
    y: object.position.y + direction.y * distance,
    z: object.position.z + direction.z * distance,
  };
}

export function syncCameraEntity(entity: THREE.Object3D, camera: Pick<ShotCamera, 'position' | 'target'> | Pick<CameraKeyframe, 'position' | 'target'>) {
  orientMinusZToTarget(entity, camera.position, camera.target);
}

export function syncLightEntity(entity: THREE.Object3D, light: DirectorLight, color: THREE.Color) {
  entity.position.set(light.position.x, light.position.y, light.position.z);
  if (light.type === 'spot' || light.type === 'area' || light.type === 'directional') orientMinusZToTarget(entity, light.position, light.target);
  entity.traverse((object) => {
    if (!object.userData.lightEmitter) return;
    const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!material) return;
    material.color.copy(color.clone().multiplyScalar(0.66));
    material.emissive.copy(color);
  });
}
