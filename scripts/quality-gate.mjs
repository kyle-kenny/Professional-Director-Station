import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/domain/model.ts','src/domain/defaultProject.ts','src/domain/actorLibrary.ts','src/domain/poseLibrary.ts','src/domain/actorMotions.ts','src/domain/lensPresets.ts','src/domain/skeletonContract.ts','src/domain/humanoidRig.ts','src/domain/collaboration.ts',
  'src/characters/characterCatalog.ts','src/characters/characterLoader.ts','src/characters/rigRuntime.ts',
  'src/engine/DirectorViewport.tsx','src/components/PoseEditorPanel.tsx','src/components/FloorPlanCanvas.tsx','src/components/DirectorFrameCanvas.tsx','src/components/TimelinePanel.tsx','src/components/WaveformStrip.tsx','src/components/AssetLibraryPanel.tsx','src/components/CollaborationPanel.tsx','src/components/ReviewWorkspace.tsx',
  'src/rendering/directorFrameRenderer.ts','src/editorial/timelineEngine.ts','src/editorial/otio.ts','src/editorial/referenceExport.ts','src/editorial/referenceExportPlan.ts',
  'src/audio/waveform.ts','src/audio/audioImport.ts','src/audio/audioTransport.ts','src/storage/audioMediaStore.ts','src/utils/assetIngest.ts','src/storage/assetBinaryStore.ts','src/store/assetRegistry.ts','src/store/poseRegistry.ts','src/store/poseUiStore.ts',
  'src/collab/collaboration.ts','src/collab/authorization.ts','src/collab/protocol.ts','src/collab/reviewWorkflow.ts','src/collab/sessionIdentity.ts','src/store/reviewRegistry.ts','src/utils/sha256.ts','src/i18n/zhCN.ts',
  'server/auth.mjs','server/local-audit-auth.mjs','server/collab-server.mjs','scripts/collaboration-smoke.mjs','scripts/collaboration-server-smoke.mjs','scripts/install-character-assets.mjs','scripts/character-smoke.mjs','scripts/localization-smoke.mjs',
  'src/tests/domain.test.ts','src/tests/directorInteraction.test.ts','src/tests/assetIngest.test.ts','src/tests/timelineEngine.test.ts','src/tests/waveform.test.ts','src/tests/otio.test.ts','src/tests/referenceExport.test.ts','src/tests/collaboration.test.ts','src/tests/reviewWorkflow.test.ts','src/tests/physicsIntegrity.test.ts','src/tests/humanoidRig.test.ts',
  '.github/workflows/ci.yml','start-windows.cmd','docs/WINDOWS_SUPPORT.md','docs/CHARACTER_LIBRARY.md','docs/CHARACTER_ASSETS.md','docs/HUMANOID_POSING.md',
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing: ${file}`);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (content, contracts, label) => { for (const contract of contracts) if (!content.includes(contract)) failures.push(`${label} missing: ${contract}`); };

const model = read('src/domain/model.ts');
must(model,["schemaVersion: z.literal('pds-1')","handedness: z.literal('right')","upAxis: z.literal('Y')","forwardAxis: z.literal('-Z')","linearUnit: z.literal('meter')",'frameAspect: z.number().min(0.25).max(4).default(16 / 9)','humanoidRigStateSchema','actorPoseKeyframeSchema','posePath','customPoses','collaboration: projectCollaborationStateSchema'],'domain contract');
const packageJson = JSON.parse(read('package.json'));
for (const script of ['build','test','test:visual','characters:install','audit:static','audit:collab','audit:characters','audit:localization','check','collab:server','collab:token']) if (!packageJson.scripts?.[script]) failures.push(`script missing: ${script}`);
if (!packageJson.dependencies?.mediabunny) failures.push('maintained MP4 media toolkit dependency missing');
if (!packageJson.dependencies?.ws) failures.push('authenticated WebSocket collaboration server dependency missing');

const actorLibrary = read('src/domain/actorLibrary.ts');
for (const preset of ['boy-child','girl-child','boy-teen','girl-teen','man-adult','woman-adult','man-elderly','woman-elderly']) if (!actorLibrary.includes(`'${preset}'`)) failures.push(`standard cast preset missing: ${preset}`);
const rig = read('src/domain/humanoidRig.ts');
must(rig,['humanoidJointIds','humanoidJointLimits','clampJointRotation','mirrorRigState','leftHandTarget','rightFootTarget','headLookAt'],'humanoid rig contract');
const loader = read('src/characters/characterLoader.ts');
must(loader,['GLTFLoader','SkeletonUtils','characterModelUrl','captureNeutralRigBase','applyActorRigAtTime','SkinnedMesh'],'open character loader contract');
const rigRuntime = read('src/characters/rigRuntime.ts');
must(rigRuntime,['sampleActorRig','twoBoneIk','applyRigToCharacter','applyHeadLookAt','maxReach','minReach','jointDrivenByIk'],'rig runtime contract');
const poseRegistry = read('src/store/poseRegistry.ts');
must(poseRegistry,['setActorJointRotation','setActorIkEnabled','setActorIkLocked','setActorIkTarget','setActorIkPole','setActorHeadLookAt','mirrorActorPose','saveCustomPose','addActorPoseKeyframe','removeActorPoseKeyframe'],'pose persistence contract');
const posePanel = read('src/components/PoseEditorPanel.tsx');
must(posePanel,['人物骨骼调姿','FK 单关节','手脚 IK / 肘膝 Pole','左右镜像','自定义姿势库','姿势关键帧'],'pose UI contract');

const assetIngest = read('src/utils/assetIngest.ts');
must(assetIngest,['glb','fbx','fbx-unit-required','MAX_ASSET_INGEST_BYTES','buildNormalizedAssetRef','contentHashSha256',"source: 'import'"],'asset ingest contract');
const assetCache = read('src/storage/assetBinaryStore.ts');
must(assetCache,['indexedDB.open','assetBinaryKey'],'asset cache contract');
const ci = read('.github/workflows/ci.yml');
must(ci,['windows-latest','audit:windows','audit:collab','audit:characters','audit:localization','browser-audit','playwright install --with-deps chromium','test:visual'],'CI contract');

const viewport = read('src/engine/DirectorViewport.tsx');
must(viewport,['instantiateDirectorCharacter','applyActorRigAtTime','rigControlId','rigJointId','focalLengthToVerticalFovDeg','lightObjects','toneMappingExposure','sampleLight','fitAspectRect'],'3D viewport contract');
if (viewport.includes('new THREE.CapsuleGeometry') || viewport.includes('new THREE.SphereGeometry(actor.demographics.headRadiusM')) failures.push('3D viewport still contains procedural human body geometry');
const floor = read('src/components/FloorPlanCanvas.tsx');
must(floor,['sampleLight','cameraGroundFrustum','HFOV'],'floor plan contract');
const frame = read('src/components/DirectorFrameCanvas.tsx');
if (!frame.includes('renderDirectorFrame')) failures.push('2D director frame is not wired to shared deterministic renderer');
const frameRenderer = read('src/rendering/directorFrameRenderer.ts');
must(frameRenderer,['projectWorldToFrame','sampleShotAtFrame','fitAspectRect','shot.frameAspect'],'shared director renderer contract');

const timelineEngine = read('src/editorial/timelineEngine.ts');
must(timelineEngine,['timeToFrame','frameToTime','frameFromElapsed','sampleShotAtFrame'],'timeline engine contract');
const timeline = read('src/components/TimelinePanel.tsx');
must(timeline,['addLightKeyframe','addActorPoseKeyframe','removeActorPoseKeyframe','lensPresetList','importAudioFile','WaveformStrip','frameFromElapsed','exportShotReferenceMp4','exportShotToOtio','parseOtioEditorial','addMarker','addNote'],'editorial timeline UI contract');
const referenceExport = read('src/editorial/referenceExport.ts');
must(referenceExport,['Mp4OutputFormat','CanvasSource','getFirstEncodableVideoCodec','getFirstEncodableAudioCodec',"['avc', 'vp9', 'vp8', 'av1', 'hevc']","['aac', 'opus', 'mp3', 'pcm-s16']",'videoSource.close()','audioSource.close()','renderDirectorFrame','resolveReferenceExportSize'],'MP4 reference export contract');

const collaborationDomain = read('src/domain/collaboration.ts');
must(collaborationDomain,['projectRoleSchema','reviewCommentSchema','frameAnnotationSchema','shotVersionRecordSchema','approvalEventSchema','revision'],'Gate 3 collaboration domain');
const authorization = read('src/collab/authorization.ts');
for (const role of ['owner','director','editor','reviewer','viewer']) if (!authorization.includes(`${role}:`)) failures.push(`Gate 3 role permission matrix missing: ${role}`);
const protocol = read('src/collab/protocol.ts');
must(protocol,['baseRevision','stale revision','collaborationLockSchema','pruneExpiredLocks','hasValidLockToken'],'Gate 3 conflict/lock protocol');
const server = read('server/collab-server.mjs');
must(server,['verifyCollaborationToken','stale-revision','lock-required','permission-denied','acquire-lock','presence','revision','persistProjectState','loadProjectState'],'collaboration server authority contract');
const review = read('src/collab/reviewWorkflow.ts');
must(review,['createImmutableShotVersion','snapshotHashSha256','assertImmutableVersion','APPROVED'],'review/version integrity contract');
const reviewUi = read('src/components/ReviewWorkspace.tsx');
must(reviewUi,['CollaborationPanel','addFrameAnnotation','rollbackToShotVersion','transitionActiveShotStatus','工程成员','fitAspectRect'],'Gate 3 review UI');
const inspector = read('src/components/Inspector.tsx');
if (inspector.includes('setShotStatus')) failures.push('Inspector still bypasses protected approval workflow');

const characterInstaller = read('scripts/install-character-assets.mjs');
must(characterInstaller,['Quaternius Universal Base Characters','CC0-1.0','gitBlobSha1','sha256','SOURCE_COMMIT'],'character provenance contract');
const zh = read('src/i18n/zhCN.ts');
must(zh,['专业导演工作站','制作管线','AI 制作','开源正式角色已加载'],'zh-CN contract');

if (failures.length) {
  console.error('PDS static quality gate FAILED');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log(`PDS static quality gate PASSED (${required.length} critical files, Gate 0-5 + 1.1 humanoid/zh-CN contracts checked)`);
