import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { issueCollaborationToken } from '../server/auth.mjs';

const BASE_URL = process.env.PDS_E2E_URL ?? 'http://127.0.0.1:4173';
const AUTH_SECRET = process.env.PDS_AUTH_SECRET ?? 'pds-ci-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const ARTIFACT_DIR = process.env.PDS_VISUAL_ARTIFACT_DIR ?? 'audit-artifacts';
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

function minimalGlb() {
  const json = JSON.stringify({ asset: { version: '2.0', generator: 'PDS final audit' }, nodes: [], meshes: [] });
  const jsonBytes = Buffer.from(json, 'utf8');
  const paddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const totalLength = 12 + 8 + paddedLength;
  const out = Buffer.alloc(totalLength, 0x20);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(paddedLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  return out;
}

function minimalWav() {
  const sampleRate = 8000;
  const sampleCount = 1600;
  const channels = 1;
  const bitsPerSample = 16;
  const dataSize = sampleCount * channels * (bitsPerSample / 8);
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataSize, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); out.writeUInt16LE(channels * bitsPerSample / 8, 32); out.writeUInt16LE(bitsPerSample, 34);
  out.write('data', 36); out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.22 * 32767);
    out.writeInt16LE(sample, 44 + i * 2);
  }
  return out;
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (overflow.scroll > overflow.width + 1) throw new Error(`${label}: horizontal overflow ${overflow.scroll}px > ${overflow.width}px`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false });
}

async function clickMode(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(180);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console.error: ${message.text()}`); });

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByText('Professional Director Station', { exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, 'desktop initial');

  await clickMode(page, '3D 导演台');
  const viewportCanvas = page.locator('.viewport canvas');
  await viewportCanvas.waitFor({ state: 'visible' });
  const viewportBox = await viewportCanvas.boundingBox();
  if (!viewportBox || viewportBox.width < 300 || viewportBox.height < 300) throw new Error('3D viewport did not produce a usable canvas.');
  await page.getByRole('button', { name: '镜头视图', exact: true }).click();
  await page.locator('.viewport-toolbar .lens-readout').filter({ hasText: '1.778:1' }).waitFor();
  await shot(page, 'desktop-3d-shot');

  await clickMode(page, '2D 站位');
  await page.locator('.canvas-workspace canvas').waitFor({ state: 'visible' });
  await page.getByText(/HFOV/).waitFor();
  await shot(page, 'desktop-floorplan');

  await clickMode(page, '2D 构图');
  await page.locator('.canvas-workspace canvas').waitFor({ state: 'visible' });
  await shot(page, 'desktop-frame');

  await clickMode(page, '时间线/声音');
  await page.locator('.timeline-page').waitFor({ state: 'visible' });
  await page.getByText('CAMERA', { exact: true }).first().waitFor();
  const dialogue = page.locator('.audio-editor-track').filter({ hasText: 'DIALOGUE' });
  await dialogue.locator('input[type=file]').setInputFiles({ name: 'audit-dialogue.wav', mimeType: 'audio/wav', buffer: minimalWav() });
  await page.getByText(/已解码、生成波形并加入 DIALOGUE/).waitFor({ timeout: 10_000 });
  await dialogue.locator('.audio-clip-card').first().waitFor();
  const markerInput = page.getByPlaceholder(/Marker @ F/);
  await markerInput.fill('Audit marker');
  await page.getByRole('button', { name: '+ Marker', exact: true }).click();
  const noteInput = page.getByPlaceholder(/Director note @ F/);
  await noteInput.fill('Audit director note');
  await page.getByRole('button', { name: '+ Note', exact: true }).click();
  await page.getByText(/Audit marker/).waitFor();
  await page.getByText(/Audit director note/).waitFor();

  const otioDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export OTIO', exact: true }).click();
  const otioDownload = await otioDownloadPromise;
  const otioPath = await otioDownload.path();
  const otioText = await fs.readFile(otioPath, 'utf8');
  if (!otioText.includes('Audit marker') || !otioText.includes('Audit director note') || !otioText.includes('audit-dialogue.wav')) throw new Error('OTIO export did not preserve editorial state.');
  const otioImport = page.locator('.editorial-export-bar input[type=file]');
  await otioImport.setInputFiles({ name: 'roundtrip.otio', mimeType: 'application/json', buffer: Buffer.from(otioText) });
  await page.getByText(/OTIO 已导入/).waitFor();

  const mp4DownloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Export MP4 Reference', exact: true }).click();
  const mp4Download = await mp4DownloadPromise;
  const mp4Path = await mp4Download.path();
  const mp4Stat = await fs.stat(mp4Path);
  if (!mp4Download.suggestedFilename().endsWith('.mp4') || mp4Stat.size < 1000) throw new Error('MP4 reference export did not produce a valid non-empty download.');
  await page.getByText(/MP4 已完成/).waitFor({ timeout: 10_000 });
  await shot(page, 'desktop-timeline');

  await clickMode(page, 'Asset Registry');
  await page.getByText('ASSET INGEST · GLB / FBX', { exact: true }).waitFor();
  const fileInput = page.locator('.asset-file-picker input[type=file]');
  await fileInput.setInputFiles({ name: 'audit-prop.glb', mimeType: 'model/gltf-binary', buffer: minimalGlb() });
  await page.getByText('PASS', { exact: true }).waitFor();
  const importButton = page.getByRole('button', { name: '导入、校验并注册资产', exact: true });
  await importButton.click();
  await page.getByText(/已注册；SHA-256/).waitFor();
  await page.getByText(/audit-prop@v001/).waitFor();
  await shot(page, 'desktop-assets');

  await clickMode(page, '协作/审片');
  await page.getByText('AUTHENTICATED COLLABORATION', { exact: true }).waitFor();
  const token = issueCollaborationToken({ sub: 'local-owner', name: 'CI Director', projectId: 'project-demo', role: 'owner', department: 'direction' }, AUTH_SECRET, 3600);
  await page.getByLabel('Signed collaboration token').fill(token);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.locator('.connection-state.connected').waitFor({ timeout: 10_000 });
  await page.getByText('CI Director', { exact: true }).first().waitFor();
  await page.getByText(/SHOT LOCK · owned/).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'REVIEW', exact: true }).click();
  await page.locator('.status-row button.active').filter({ hasText: 'REVIEW' }).waitFor();
  await page.getByRole('button', { name: 'APPROVED', exact: true }).click();
  await page.locator('.status-row button.active').filter({ hasText: 'APPROVED' }).waitFor();
  await shot(page, 'desktop-review-approved');

  await clickMode(page, '3D 导演台');
  await page.getByText(/APPROVED · 只读/).first().waitFor();
  if (!(await page.getByRole('button', { name: '撤销' }).isDisabled())) throw new Error('Undo remained enabled on an approved Shot.');
  const inspectorFrameInput = page.locator('.inspector input[type=number]').first();
  if (!(await inspectorFrameInput.isDisabled())) throw new Error('Inspector remained editable on an approved Shot.');
  await shot(page, 'desktop-approved-readonly');

  await clickMode(page, 'Pipeline');
  await page.getByText('PIPELINE INTEROPERABILITY', { exact: true }).waitFor();
  const usdDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download USDA', exact: true }).click();
  const usd = await usdDownload;
  const usdPath = await usd.path();
  const usdText = await fs.readFile(usdPath, 'utf8');
  for (const required of ['metersPerUnit = 1', 'float focalLength = 0.5', 'float horizontalAperture = 0.36', 'float verticalAperture = 0.2025', 'matrix4d xformOp:transform', 'custom double pds:frameAspect = 1.777777778']) {
    if (!usdText.includes(required)) throw new Error(`Downloaded USDA missing physical camera contract: ${required}`);
  }
  await shot(page, 'desktop-pipeline');

  await clickMode(page, 'AI Production');
  await page.getByText('AI PRODUCTION', { exact: true }).waitFor();
  await page.getByRole('button', { name: '生成 storyboard', exact: true }).click();
  await page.getByText(/storyboard 已生成：/).waitFor({ timeout: 10_000 });
  await page.getByText(/STORYBOARD · generated/).waitFor();
  await page.locator('.ai-output img').first().waitFor({ state: 'visible', timeout: 10_000 });
  await shot(page, 'desktop-ai');

  const projectDownload = page.waitForEvent('download');
  await page.getByTitle('导出工程').click();
  const projectFile = await projectDownload;
  if (projectFile.suggestedFilename() !== 'professional-director-station.pds.json') throw new Error(`Unexpected project filename: ${projectFile.suggestedFilename()}`);
  const projectPath = await projectFile.path();
  const exported = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  if (exported.schemaVersion !== 'pds-1' || exported.id !== 'project-demo') throw new Error('Exported project JSON failed basic integrity checks.');
  if (exported.sequences[0].shots[0].status !== 'APPROVED' || Math.abs(exported.sequences[0].shots[0].frameAspect - 16 / 9) > 1e-9) throw new Error('Approved status or authoritative frame aspect was not preserved.');
  if (!exported.assets.some((asset) => asset.id === 'audit-prop')) throw new Error('Imported GLB asset was not preserved in project export.');
  if (!exported.ai.outputs.some((output) => output.status === 'generated')) throw new Error('Generated storyboard provenance was not preserved in project export.');
  if (!exported.sequences[0].shots[0].audio.some((clip) => clip.name.includes('audit-dialogue'))) throw new Error('Imported audio clip was not preserved in project export.');
  await assertNoHorizontalOverflow(page, 'desktop final');

  const mobile = await context.newPage();
  const mobileErrors = [];
  mobile.on('pageerror', (error) => mobileErrors.push(`pageerror: ${error.message}`));
  mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(`console.error: ${message.text()}`); });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mobile.getByText('Professional Director Station', { exact: true }).waitFor();
  await clickMode(mobile, '3D 导演台');
  await mobile.locator('.viewport canvas').waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(mobile, 'mobile 3d');
  await shot(mobile, 'mobile-3d');
  await clickMode(mobile, 'Asset Registry');
  await mobile.getByText('ASSET INGEST · GLB / FBX', { exact: true }).waitFor();
  await assertNoHorizontalOverflow(mobile, 'mobile assets');
  await shot(mobile, 'mobile-assets');
  await clickMode(mobile, 'AI Production');
  await mobile.getByText('AI PRODUCTION', { exact: true }).waitFor();
  await assertNoHorizontalOverflow(mobile, 'mobile ai');
  await shot(mobile, 'mobile-ai');
  if (mobileErrors.length) throw new Error(`Mobile browser errors:\n${mobileErrors.join('\n')}`);
  await mobile.close();

  if (browserErrors.length) throw new Error(`Desktop browser errors:\n${browserErrors.join('\n')}`);
  console.log('PDS Chromium full editorial / approval / visual smoke PASSED');
} finally {
  await context.close();
  await browser.close();
}
