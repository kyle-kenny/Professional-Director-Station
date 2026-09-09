import fs from 'node:fs/promises';
import path from 'node:path';

const read = (file) => fs.readFile(file, 'utf8');
const [catalog, loader, viewport, rigDomain, rigRuntime, posePanel, poseRegistry, timeline, docs] = await Promise.all([
  read('src/characters/characterCatalog.ts'),
  read('src/characters/characterLoader.ts'),
  read('src/engine/DirectorViewport.tsx'),
  read('src/domain/humanoidRig.ts'),
  read('src/characters/rigRuntime.ts'),
  read('src/components/PoseEditorPanel.tsx'),
  read('src/store/poseRegistry.ts'),
  read('src/components/TimelinePanel.tsx'),
  read('docs/CHARACTER_ASSETS.md'),
]);

const models = ['Teen_Male_FullBody', 'Teen_Female_FullBody', 'Regular_Male_FullBody', 'Regular_Female_FullBody', 'Superhero_Male_FullBody', 'Superhero_Female_FullBody'];
for (const token of models) if (!catalog.includes(token)) throw new Error(`角色目录缺少正式开源模型：${token}`);
if (!loader.includes('GLTFLoader') || !loader.includes('cloneSkeleton') || !loader.includes('captureNeutralRigBase')) throw new Error('角色加载器未使用真实 SkinnedMesh/Humanoid 骨骼链。');
if (viewport.includes('buildDirectorActor') || viewport.includes('CapsuleGeometry')) throw new Error('3D 视口重新出现程序化人体建模。');
for (const token of ['人物调姿', 'rigJointId', 'rigControlId', 'setActorIkTarget', 'setActorJointRotation', 'objectChange']) if (!viewport.includes(token)) throw new Error(`3D 调姿缺少：${token}`);
for (const token of ['humanoidJointLimits', 'leftHandTarget', 'leftElbowPole', 'headLookAt', 'mirrorRigState', 'lockedWorldTarget']) if (!rigDomain.includes(token)) throw new Error(`Humanoid Rig 合约缺少：${token}`);
for (const token of ['twoBoneIk', 'jointDrivenByIk', 'applyHeadLookAt', 'sampleActorRig', 'readAdditiveJointRotation', 'applyAdditiveJointRotationToBone', 'lockedWorldTarget']) if (!rigRuntime.includes(token)) throw new Error(`骨骼运行时缺少：${token}`);
for (const token of ['FK 单关节', '手脚 IK / 肘膝 Pole', '左右镜像', '自定义姿势库', '姿势关键帧']) if (!posePanel.includes(token)) throw new Error(`调姿面板缺少：${token}`);
for (const token of ['recordProjectHistory', 'setActorIkLocked', 'lockedWorldTarget', 'saveCustomPose', 'clearActorPoseAnimation', 'upsertPoseKeyframe']) if (!poseRegistry.includes(token)) throw new Error(`调姿工程历史缺少：${token}`);
if (!timeline.includes('姿势关键帧') || !timeline.includes('addActorPoseKeyframe')) throw new Error('时间线没有暴露骨骼姿势关键帧。');
if (!docs.includes('CC0') || !docs.includes('Quaternius')) throw new Error('角色来源/许可证文档不完整。');

const assetRoot = path.resolve('public/assets/vendor/quaternius/universal-base-characters');
const manifest = JSON.parse(await read(path.join(assetRoot, 'manifest.json')));
if (manifest.assetPack !== 'Quaternius Universal Base Characters' || manifest.license !== 'CC0-1.0') throw new Error('角色安装 manifest 的来源或许可证不正确。');
if (!manifest.mirrorCommit || !manifest.files || Object.keys(manifest.files).length < 12) throw new Error('角色安装 manifest 缺少锁定来源或文件哈希。');

const requiredBones = [
  'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r',
];
for (const model of models) {
  const file = `${model}.gltf`;
  const gltf = JSON.parse(await read(path.join(assetRoot, file)));
  const names = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const missing = requiredBones.filter((bone) => !names.has(bone));
  if (missing.length) throw new Error(`${file} 缺少 PDS Humanoid 必需骨骼：${missing.join(', ')}`);
  if (!(gltf.skins?.length > 0)) throw new Error(`${file} 没有 glTF skin，不能作为正式 SkinnedMesh 人物。`);
  if (!(gltf.meshes?.length > 0)) throw new Error(`${file} 没有网格。`);
  const record = manifest.files[file];
  if (!record?.sha256 || !/^[0-9a-f]{64}$/.test(record.sha256)) throw new Error(`${file} 缺少 SHA-256 provenance。`);
}

console.log(`PDS 正式开源人物 + FK/IK 调姿工业审计通过：${models.length} 个 CC0 SkinnedMesh 均含 ${requiredBones.length} 个必需 Humanoid 骨骼。`);
