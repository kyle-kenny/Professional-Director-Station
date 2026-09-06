import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/domain/model.ts',
  'src/domain/defaultProject.ts',
  'src/domain/actorLibrary.ts',
  'src/domain/poseLibrary.ts',
  'src/domain/actorMotions.ts',
  'src/domain/lensPresets.ts',
  'src/domain/skeletonContract.ts',
  'src/engine/DirectorViewport.tsx',
  'src/components/FloorPlanCanvas.tsx',
  'src/components/DirectorFrameCanvas.tsx',
  'src/components/TimelinePanel.tsx',
  'src/components/WaveformStrip.tsx',
  'src/components/AssetLibraryPanel.tsx',
  'src/rendering/directorFrameRenderer.ts',
  'src/editorial/timelineEngine.ts',
  'src/editorial/otio.ts',
  'src/editorial/referenceExport.ts',
  'src/editorial/referenceExportPlan.ts',
  'src/audio/waveform.ts',
  'src/audio/audioImport.ts',
  'src/audio/audioTransport.ts',
  'src/storage/audioMediaStore.ts',
  'src/utils/assetIngest.ts',
  'src/storage/assetBinaryStore.ts',
  'src/store/assetRegistry.ts',
  'src/collab/collaboration.ts',
  'src/tests/domain.test.ts',
  'src/tests/directorInteraction.test.ts',
  'src/tests/assetIngest.test.ts',
  'src/tests/timelineEngine.test.ts',
  'src/tests/waveform.test.ts',
  'src/tests/otio.test.ts',
  'src/tests/referenceExport.test.ts',
  '.github/workflows/ci.yml',
  'start-windows.cmd',
  'docs/WINDOWS_SUPPORT.md',
  'docs/CHARACTER_LIBRARY.md',
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing: ${file}`);

const model = fs.readFileSync(path.join(root, 'src/domain/model.ts'), 'utf8');
for (const contract of ["schemaVersion: z.literal('pds-1')", "handedness: z.literal('right')", "upAxis: z.literal('Y')", "forwardAxis: z.literal('-Z')", "linearUnit: z.literal('meter')", 'exposureEv: z.number().min(-8).max(8).default(0)', 'lightKeyframeSchema', 'path: z.array(lightKeyframeSchema).default([])', "sourceFormat: z.enum(['glb', 'fbx']).optional()", 'sourceUnitScaleMeters: z.number().positive().optional()', 'diagnostics: z.array(assetDiagnosticSchema).default([])', 'waveformKey: z.string().min(1).optional()', 'markers: z.array(timelineMarkerSchema).default([])', 'shotNoteSchema']) {
  if (!model.includes(contract)) failures.push(`domain contract missing: ${contract}`);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const script of ['build', 'test', 'audit:static', 'check']) if (!packageJson.scripts?.[script]) failures.push(`script missing: ${script}`);
if (!packageJson.dependencies?.mediabunny) failures.push('maintained MP4 media toolkit dependency missing');

const actorLibrary = fs.readFileSync(path.join(root, 'src/domain/actorLibrary.ts'), 'utf8');
for (const preset of ['boy-child','girl-child','boy-teen','girl-teen','man-adult','woman-adult','man-elderly','woman-elderly']) {
  if (!actorLibrary.includes(`'${preset}'`)) failures.push(`standard cast preset missing: ${preset}`);
}
for (const ageGroup of ["'child'", "'teen'", "'adult'", "'elderly'"]) {
  if (!model.includes(ageGroup)) failures.push(`actor age group contract missing: ${ageGroup}`);
}

const poses = fs.readFileSync(path.join(root, 'src/domain/poseLibrary.ts'), 'utf8');
for (const pose of ['neutral-standing', 'dialogue-open', 'hands-on-hips', 'pointing', 'defensive', 'crouch', 'seated', 'walk-stride']) {
  if (!poses.includes(pose)) failures.push(`director pose preset missing: ${pose}`);
}
const motions = fs.readFileSync(path.join(root, 'src/domain/actorMotions.ts'), 'utf8');
for (const motion of ['walk-forward', 'retreat', 'cross-left', 'cross-right']) {
  if (!motions.includes(motion)) failures.push(`actor motion preset missing: ${motion}`);
}
const lenses = fs.readFileSync(path.join(root, 'src/domain/lensPresets.ts'), 'utf8');
for (const focal of [18, 24, 35, 50, 85, 135, 200, 300]) {
  if (!lenses.includes(`focalLengthMm: ${focal}`)) failures.push(`director lens preset missing: ${focal}mm`);
}
const skeleton = fs.readFileSync(path.join(root, 'src/domain/skeletonContract.ts'), 'utf8');
if (!skeleton.includes("id: 'pds-humanoid-1'")) failures.push('humanoid retarget contract id missing');
if (!skeleton.includes("forwardAxis: '-Z'")) failures.push('humanoid retarget forward-axis contract missing');

const assetIngest = fs.readFileSync(path.join(root, 'src/utils/assetIngest.ts'), 'utf8');
for (const contract of ['glb', 'fbx', 'fbx-unit-required', 'MAX_ASSET_INGEST_BYTES', 'buildNormalizedAssetRef']) {
  if (!assetIngest.includes(contract)) failures.push(`asset ingest contract missing: ${contract}`);
}
const assetCache = fs.readFileSync(path.join(root, 'src/storage/assetBinaryStore.ts'), 'utf8');
if (!assetCache.includes('indexedDB.open')) failures.push('IndexedDB asset binary cache missing');
if (!assetCache.includes('assetBinaryKey')) failures.push('stable asset binary cache key missing');
const assetPanel = fs.readFileSync(path.join(root, 'src/components/AssetLibraryPanel.tsx'), 'utf8');
if (!assetPanel.includes('FBX 来源单位')) failures.push('explicit FBX source-unit control missing');
if (!assetPanel.includes('putAssetBinary')) failures.push('asset UI does not persist source binary');
if (!assetPanel.includes('registerProjectAsset')) failures.push('asset UI does not register normalized asset refs');

const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
if (!ci.includes('windows-latest')) failures.push('Windows CI runner missing');
if (!ci.includes('audit:windows')) failures.push('Windows compatibility audit missing from CI');

const viewport = fs.readFileSync(path.join(root, 'src/engine/DirectorViewport.tsx'), 'utf8');
if (!viewport.includes('geometry?.dispose')) failures.push('3D viewport resource disposal is missing');
if (!viewport.includes('focalLengthToVerticalFovDeg')) failures.push('real lens math is not wired into 3D viewport');
if (!viewport.includes('resolvePoseDefinition')) failures.push('pose library is not wired into 3D actor rendering');
if (!viewport.includes('lightObjects')) failures.push('selectable light gizmos are not wired into 3D viewport');
if (!viewport.includes('toneMappingExposure')) failures.push('shot exposure compensation is not wired into renderer');
if (!viewport.includes('sampleLight')) failures.push('timeline light sampling is not wired into 3D viewport');

const floor = fs.readFileSync(path.join(root, 'src/components/FloorPlanCanvas.tsx'), 'utf8');
if (!floor.includes('180° ACTION AXIS')) failures.push('floor plan 180-degree teaching/directing aid missing');
if (!floor.includes('sampleLight')) failures.push('floor plan light animation is not synchronized to playhead');

const frame = fs.readFileSync(path.join(root, 'src/components/DirectorFrameCanvas.tsx'), 'utf8');
if (!frame.includes('renderDirectorFrame')) failures.push('2D director frame is not wired to shared deterministic renderer');
const frameRenderer = fs.readFileSync(path.join(root, 'src/rendering/directorFrameRenderer.ts'), 'utf8');
if (!frameRenderer.includes('projectWorldToFrame')) failures.push('shared director renderer is not derived from 3D camera geometry');
if (!frameRenderer.includes('sampleShotAtFrame')) failures.push('shared director renderer is not frame deterministic');

const timelineEngine = fs.readFileSync(path.join(root, 'src/editorial/timelineEngine.ts'), 'utf8');
for (const contract of ['timeToFrame', 'frameToTime', 'frameFromElapsed', 'sampleShotAtFrame']) if (!timelineEngine.includes(contract)) failures.push(`timeline engine contract missing: ${contract}`);
const waveform = fs.readFileSync(path.join(root, 'src/audio/waveform.ts'), 'utf8');
if (!waveform.includes('buildWaveformPeaks')) failures.push('deterministic audio waveform analysis missing');
const audioCache = fs.readFileSync(path.join(root, 'src/storage/audioMediaStore.ts'), 'utf8');
if (!audioCache.includes('indexedDB.open')) failures.push('IndexedDB audio media cache missing');
const otio = fs.readFileSync(path.join(root, 'src/editorial/otio.ts'), 'utf8');
if (!otio.includes('Timeline.1') && !otio.includes("schema('Timeline', 1)")) failures.push('OTIO Timeline schema export missing');
if (!otio.includes('parseOtioEditorial')) failures.push('OTIO editorial import missing');
const referenceExport = fs.readFileSync(path.join(root, 'src/editorial/referenceExport.ts'), 'utf8');
for (const contract of ['Mp4OutputFormat', 'CanvasSource', "codec: 'avc'", "codec: 'aac'", 'renderDirectorFrame']) if (!referenceExport.includes(contract)) failures.push(`MP4 reference export contract missing: ${contract}`);

const timeline = fs.readFileSync(path.join(root, 'src/components/TimelinePanel.tsx'), 'utf8');
for (const contract of ['addLightKeyframe', 'lensPresetList', 'importAudioFile', 'WaveformStrip', 'frameFromElapsed', 'exportShotReferenceMp4', 'exportShotToOtio', 'parseOtioEditorial', 'addMarker', 'addNote']) {
  if (!timeline.includes(contract)) failures.push(`editorial timeline UI contract missing: ${contract}`);
}

if (failures.length) {
  console.error('PDS static quality gate FAILED');
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}
console.log(`PDS static quality gate PASSED (${required.length} critical files, Gate 0-2 domain/3D/2D/assets/editorial/audio/CI contracts checked)`);
