import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/domain/model.ts','src/domain/defaultProject.ts','src/domain/actorLibrary.ts','src/domain/poseLibrary.ts','src/domain/actorMotions.ts','src/domain/lensPresets.ts','src/domain/skeletonContract.ts','src/domain/collaboration.ts',
  'src/engine/DirectorViewport.tsx','src/components/FloorPlanCanvas.tsx','src/components/DirectorFrameCanvas.tsx','src/components/TimelinePanel.tsx','src/components/WaveformStrip.tsx','src/components/AssetLibraryPanel.tsx','src/components/CollaborationPanel.tsx','src/components/ReviewWorkspace.tsx',
  'src/rendering/directorFrameRenderer.ts','src/editorial/timelineEngine.ts','src/editorial/otio.ts','src/editorial/referenceExport.ts','src/editorial/referenceExportPlan.ts',
  'src/audio/waveform.ts','src/audio/audioImport.ts','src/audio/audioTransport.ts','src/storage/audioMediaStore.ts','src/utils/assetIngest.ts','src/storage/assetBinaryStore.ts','src/store/assetRegistry.ts',
  'src/collab/collaboration.ts','src/collab/authorization.ts','src/collab/protocol.ts','src/collab/reviewWorkflow.ts','src/collab/sessionIdentity.ts','src/store/reviewRegistry.ts','src/utils/sha256.ts',
  'server/auth.mjs','server/local-audit-auth.mjs','server/collab-server.mjs','scripts/collaboration-smoke.mjs','scripts/collaboration-server-smoke.mjs',
  'src/tests/domain.test.ts','src/tests/directorInteraction.test.ts','src/tests/assetIngest.test.ts','src/tests/timelineEngine.test.ts','src/tests/waveform.test.ts','src/tests/otio.test.ts','src/tests/referenceExport.test.ts','src/tests/collaboration.test.ts','src/tests/reviewWorkflow.test.ts','src/tests/physicsIntegrity.test.ts',
  '.github/workflows/ci.yml','start-windows.cmd','docs/WINDOWS_SUPPORT.md','docs/CHARACTER_LIBRARY.md',
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing: ${file}`);

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const model = read('src/domain/model.ts');
for (const contract of ["schemaVersion: z.literal('pds-1')", "handedness: z.literal('right')", "upAxis: z.literal('Y')", "forwardAxis: z.literal('-Z')", "linearUnit: z.literal('meter')", 'frameAspect: z.number().min(0.25).max(4).default(16 / 9)', 'exposureEv: z.number().min(-8).max(8).default(0)', 'lightKeyframeSchema', 'path: z.array(lightKeyframeSchema).default([])', "sourceFormat: z.enum(['glb', 'fbx']).optional()", 'sourceUnitScaleMeters: z.number().positive().optional()', 'diagnostics: z.array(assetDiagnosticSchema).default([])', 'waveformKey: z.string().min(1).optional()', 'markers: z.array(timelineMarkerSchema).default([])', 'shotNoteSchema', 'contentHashSha256', 'assetProvenanceSchema', 'collaboration: projectCollaborationStateSchema']) {
  if (!model.includes(contract)) failures.push(`domain contract missing: ${contract}`);
}
const packageJson = JSON.parse(read('package.json'));
for (const script of ['build', 'test', 'test:visual', 'audit:static', 'audit:collab', 'check', 'collab:server', 'collab:token']) if (!packageJson.scripts?.[script]) failures.push(`script missing: ${script}`);
if (!packageJson.dependencies?.mediabunny) failures.push('maintained MP4 media toolkit dependency missing');
if (!packageJson.dependencies?.ws) failures.push('authenticated WebSocket collaboration server dependency missing');

const actorLibrary = read('src/domain/actorLibrary.ts');
for (const preset of ['boy-child','girl-child','boy-teen','girl-teen','man-adult','woman-adult','man-elderly','woman-elderly']) if (!actorLibrary.includes(`'${preset}'`)) failures.push(`standard cast preset missing: ${preset}`);
for (const ageGroup of ["'child'", "'teen'", "'adult'", "'elderly'"]) if (!model.includes(ageGroup)) failures.push(`actor age group contract missing: ${ageGroup}`);
const poses = read('src/domain/poseLibrary.ts');
for (const pose of ['neutral-standing', 'dialogue-open', 'hands-on-hips', 'pointing', 'defensive', 'crouch', 'seated', 'walk-stride']) if (!poses.includes(pose)) failures.push(`director pose preset missing: ${pose}`);
const motions = read('src/domain/actorMotions.ts');
for (const motion of ['walk-forward', 'retreat', 'cross-left', 'cross-right']) if (!motions.includes(motion)) failures.push(`actor motion preset missing: ${motion}`);
const lenses = read('src/domain/lensPresets.ts');
for (const focal of [18, 24, 35, 50, 85, 135, 200, 300]) if (!lenses.includes(`focalLengthMm: ${focal}`)) failures.push(`director lens preset missing: ${focal}mm`);
const skeleton = read('src/domain/skeletonContract.ts');
if (!skeleton.includes("id: 'pds-humanoid-1'")) failures.push('humanoid retarget contract id missing');
if (!skeleton.includes("forwardAxis: '-Z'")) failures.push('humanoid retarget forward-axis contract missing');

const assetIngest = read('src/utils/assetIngest.ts');
for (const contract of ['glb', 'fbx', 'fbx-unit-required', 'MAX_ASSET_INGEST_BYTES', 'buildNormalizedAssetRef', 'contentHashSha256', "source: 'import'"]) if (!assetIngest.includes(contract)) failures.push(`asset ingest contract missing: ${contract}`);
const assetCache = read('src/storage/assetBinaryStore.ts');
if (!assetCache.includes('indexedDB.open')) failures.push('IndexedDB asset binary cache missing');
if (!assetCache.includes('assetBinaryKey')) failures.push('stable asset binary cache key missing');
const assetPanel = read('src/components/AssetLibraryPanel.tsx');
for (const contract of ['FBX 来源单位', 'putAssetBinary', 'registerProjectAsset', 'sha256Bytes', 'provenance']) if (!assetPanel.includes(contract)) failures.push(`asset registry UI contract missing: ${contract}`);

const ci = read('.github/workflows/ci.yml');
for (const contract of ['windows-latest', 'audit:windows', 'audit:collab', 'browser-audit', 'playwright install --with-deps chromium', 'test:visual']) if (!ci.includes(contract)) failures.push(`CI contract missing: ${contract}`);

const viewport = read('src/engine/DirectorViewport.tsx');
for (const contract of ['geometry?.dispose', 'focalLengthToVerticalFovDeg', 'resolvePoseDefinition', 'lightObjects', 'toneMappingExposure', 'sampleLight', 'fitAspectRect']) if (!viewport.includes(contract)) failures.push(`3D viewport contract missing: ${contract}`);
const floor = read('src/components/FloorPlanCanvas.tsx');
for (const contract of ['180° ACTION AXIS', 'sampleLight', 'cameraGroundFrustum', 'HFOV']) if (!floor.includes(contract)) failures.push(`floor plan contract missing: ${contract}`);
const frame = read('src/components/DirectorFrameCanvas.tsx');
if (!frame.includes('renderDirectorFrame')) failures.push('2D director frame is not wired to shared deterministic renderer');
const frameRenderer = read('src/rendering/directorFrameRenderer.ts');
for (const contract of ['projectWorldToFrame', 'sampleShotAtFrame', 'fitAspectRect', 'shot.frameAspect']) if (!frameRenderer.includes(contract)) failures.push(`shared director renderer contract missing: ${contract}`);

const timelineEngine = read('src/editorial/timelineEngine.ts');
for (const contract of ['timeToFrame', 'frameToTime', 'frameFromElapsed', 'sampleShotAtFrame']) if (!timelineEngine.includes(contract)) failures.push(`timeline engine contract missing: ${contract}`);
const waveform = read('src/audio/waveform.ts');
if (!waveform.includes('buildWaveformPeaks')) failures.push('deterministic audio waveform analysis missing');
const audioCache = read('src/storage/audioMediaStore.ts');
if (!audioCache.includes('indexedDB.open')) failures.push('IndexedDB audio media cache missing');
const otio = read('src/editorial/otio.ts');
if (!otio.includes('Timeline.1') && !otio.includes("schema('Timeline', 1)")) failures.push('OTIO Timeline schema export missing');
if (!otio.includes('parseOtioEditorial')) failures.push('OTIO editorial import missing');
const referenceExport = read('src/editorial/referenceExport.ts');
for (const contract of ['Mp4OutputFormat', 'CanvasSource', 'getFirstEncodableVideoCodec', 'getFirstEncodableAudioCodec', "['avc', 'vp9', 'vp8', 'av1', 'hevc']", "['aac', 'opus', 'mp3', 'pcm-s16']", 'videoSource.close()', 'audioSource.close()', 'renderDirectorFrame', 'resolveReferenceExportSize']) if (!referenceExport.includes(contract)) failures.push(`MP4 reference export contract missing: ${contract}`);
const timeline = read('src/components/TimelinePanel.tsx');
for (const contract of ['addLightKeyframe', 'lensPresetList', 'importAudioFile', 'WaveformStrip', 'frameFromElapsed', 'exportShotReferenceMp4', 'exportShotToOtio', 'parseOtioEditorial', 'addMarker', 'addNote']) if (!timeline.includes(contract)) failures.push(`editorial timeline UI contract missing: ${contract}`);

const collaborationDomain = read('src/domain/collaboration.ts');
for (const contract of ['projectRoleSchema', 'reviewCommentSchema', 'frameAnnotationSchema', 'shotVersionRecordSchema', 'approvalEventSchema', 'revision']) if (!collaborationDomain.includes(contract)) failures.push(`Gate 3 collaboration domain missing: ${contract}`);
const authorization = read('src/collab/authorization.ts');
for (const role of ['owner', 'director', 'editor', 'reviewer', 'viewer']) if (!authorization.includes(`${role}:`)) failures.push(`Gate 3 role permission matrix missing: ${role}`);
const protocol = read('src/collab/protocol.ts');
for (const contract of ['baseRevision', 'stale revision', 'collaborationLockSchema', 'pruneExpiredLocks', 'hasValidLockToken']) if (!protocol.includes(contract)) failures.push(`Gate 3 conflict/lock protocol missing: ${contract}`);
const server = read('server/collab-server.mjs');
for (const contract of ['verifyCollaborationToken', 'stale-revision', 'lock-required', 'permission-denied', 'acquire-lock', 'presence', 'revision', 'persistProjectState', 'loadProjectState']) if (!server.includes(contract)) failures.push(`collaboration server authority contract missing: ${contract}`);
const auth = read('server/auth.mjs');
for (const contract of ['createHmac', 'timingSafeEqual', "alg: 'HS256'", 'Token claim missing', 'expired']) if (!auth.includes(contract)) failures.push(`collaboration authentication contract missing: ${contract}`);
const localAuditAuth = read('server/local-audit-auth.mjs');
for (const contract of ['LOCAL_AUDIT_SECRET', 'PDS_ALLOW_INSECURE_LOCAL_AUTH']) if (!localAuditAuth.includes(contract) && !auth.includes(contract) && !ci.includes(contract)) failures.push(`local audit authentication contract missing: ${contract}`);
const review = read('src/collab/reviewWorkflow.ts');
for (const contract of ['createImmutableShotVersion', 'snapshotHashSha256', 'assertImmutableVersion', 'APPROVED']) if (!review.includes(contract)) failures.push(`review/version integrity contract missing: ${contract}`);
const reviewUi = read('src/components/ReviewWorkspace.tsx');
for (const contract of ['CollaborationPanel', 'addFrameAnnotation', 'rollbackToShotVersion', 'transitionActiveShotStatus', 'PROJECT MEMBERS', 'fitAspectRect']) if (!reviewUi.includes(contract)) failures.push(`Gate 3 review UI missing: ${contract}`);
const inspector = read('src/components/Inspector.tsx');
if (inspector.includes('setShotStatus')) failures.push('Inspector still bypasses protected Gate 3 approval workflow');

if (failures.length) {
  console.error('PDS static quality gate FAILED');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log(`PDS static quality gate PASSED (${required.length} critical files, Gate 0-5 director/editorial/collaboration/pipeline/AI contracts checked)`);
