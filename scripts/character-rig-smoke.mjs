import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
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

for (const token of ['Teen_Male_FullBody', 'Teen_Female_FullBody', 'Regular_Male_FullBody', 'Regular_Female_FullBody', 'Superhero_Male_FullBody', 'Superhero_Female_FullBody']) {
  if (!catalog.includes(token)) throw new Error(`角色目录缺少正式开源模型：${token}`);
}
if (!loader.includes('GLTFLoader') || !loader.includes('cloneSkeleton') || !loader.includes('captureNeutralRigBase')) throw new Error('角色加载器未使用真实 SkinnedMesh/Humanoid 骨骼链。');
if (viewport.includes('buildDirectorActor') || viewport.includes('CapsuleGeometry')) throw new Error('3D 视口重新出现程序化人体建模。');
for (const token of ['人物调姿', 'rigJointId', 'rigControlId', 'setActorIkTarget', 'setActorJointRotation']) if (!viewport.includes(token)) throw new Error(`3D 调姿缺少：${token}`);
for (const token of ['humanoidJointLimits', 'leftHandTarget', 'leftElbowPole', 'headLookAt', 'mirrorRigState']) if (!rigDomain.includes(token)) throw new Error(`Humanoid Rig 合约缺少：${token}`);
for (const token of ['twoBoneIk', 'jointDrivenByIk', 'applyHeadLookAt', 'sampleActorRig', 'readAdditiveJointRotation']) if (!rigRuntime.includes(token)) throw new Error(`骨骼运行时缺少：${token}`);
for (const token of ['FK 单关节', '手脚 IK / 肘膝 Pole', '左右镜像', '自定义姿势库', '姿势关键帧']) if (!posePanel.includes(token)) throw new Error(`调姿面板缺少：${token}`);
for (const token of ['recordProjectHistory', 'setActorIkLocked', 'saveCustomPose', 'clearActorPoseAnimation', 'upsertPoseKeyframe']) if (!poseRegistry.includes(token)) throw new Error(`调姿工程历史缺少：${token}`);
if (!timeline.includes('姿势关键帧') || !timeline.includes('addActorPoseKeyframe')) throw new Error('时间线没有暴露骨骼姿势关键帧。');
if (!docs.includes('CC0') || !docs.includes('Quaternius')) throw new Error('角色来源/许可证文档不完整。');
console.log('PDS 正式开源人物 + FK/IK 调姿工业审计通过。');
