import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { issueCollaborationToken } from '../server/auth.mjs';

const BASE_URL = process.env.PDS_E2E_URL ?? 'http://127.0.0.1:4173';
const AUTH_SECRET = process.env.PDS_AUTH_SECRET ?? 'pds-ci-secret-0123456789-abcdefghijklmnopqrstuvwxyz';
const ARTIFACT_DIR = process.env.PDS_VISUAL_ARTIFACT_DIR ?? 'audit-artifacts';
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

function minimalGlb() {
  const json = JSON.stringify({ asset: { version: '2.0', generator: 'PDS 1.1 audit' }, nodes: [], meshes: [] });
  const jsonBytes = Buffer.from(json, 'utf8');
  const paddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const totalLength = 12 + 8 + paddedLength;
  const out = Buffer.alloc(totalLength, 0x20);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(paddedLength, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonBytes.copy(out, 20);
  return out;
}

function minimalWav() {
  const sampleRate = 8000, sampleCount = 1600, channels = 1, bitsPerSample = 16;
  const dataSize = sampleCount * channels * (bitsPerSample / 8);
  const out = Buffer.alloc(44 + dataSize);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataSize, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); out.writeUInt16LE(channels * bitsPerSample / 8, 32); out.writeUInt16LE(bitsPerSample, 34);
  out.write('data', 36); out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < sampleCount; i += 1) out.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.22 * 32767), 44 + i * 2);
  return out;
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (overflow.scroll > overflow.width + 1) throw new Error(`${label}: horizontal overflow ${overflow.scroll}px > ${overflow.width}px`);
}

async function shot(page, name) { await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false }); }
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
  await page.getByText('专业导演工作站', { exact: true }).waitFor();
  await assertNoHorizontalOverflow(page, 'desktop initial');

  // 1.1 formal open-source character loading + full-body posing.
  await clickMode(page, '3D 导演台');
  const viewportCanvas = page.locator('.viewport canvas');
  await viewportCanvas.waitFor({ state: 'visible' });
  const viewportBox = await viewportCanvas.boundingBox();
  if (!viewportBox || viewportBox.width < 300 || viewportBox.height < 300) throw new Error('3D 视口没有生成可用画布。');
  await page.locator('[data-character-status]').filter({ hasText: '开源正式角色已加载' }).waitFor({ timeout: 20_000 });
  if (await page.locator('[data-character-status]').filter({ hasText: '失败' }).count()) throw new Error('正式开源角色存在加载失败。');
  await shot(page, 'desktop-open-characters');

  const posePanel = page.locator('.pose-editor-panel');
  await posePanel.getByText('人物骨骼调姿', { exact: true }).waitFor();
  await page.getByRole('button', { name: '人物调姿', exact: true }).click();
  await page.locator('.viewport-shell[data-pose-mode="active"]').waitFor();

  // FK: edit the default chest joint and verify the value survives state refresh.
  const fkNumber = posePanel.locator('.joint-axis-grid label').first().locator('input[type=number]');
  await fkNumber.fill('20'); await fkNumber.press('Enter');
  await page.waitForTimeout(80);
  if (Math.abs(Number(await fkNumber.inputValue()) - 20) > 0.1) throw new Error('FK 胸椎编辑未保存。');

  // IK: enable left arm, select 3D target, edit target numerically, then world-lock it.
  const leftArm = posePanel.locator('.ik-card').filter({ hasText: '左手臂' });
  const leftChecks = leftArm.locator('input[type=checkbox]');
  await leftChecks.nth(0).check();
  await leftArm.getByRole('button', { name: /3D 拖动 左手 IK/ }).click();
  await page.locator('.viewport-shell[data-rig-selection="控制器:leftHandTarget"]').waitFor();
  const targetX = leftArm.locator('.pose-vec-editor').nth(0).locator('input[type=number]').nth(0);
  const originalTargetX = Number(await targetX.inputValue());
  await targetX.fill(String(originalTargetX - 0.12)); await targetX.press('Enter');
  await leftChecks.nth(1).check();
  if (!(await targetX.isDisabled())) throw new Error('世界空间 IK 锁定后目标数值仍可编辑。');

  // Look-at, pose keyframe, mirror, custom pose, undo/redo.
  const lookToggle = posePanel.locator('label.toggle-field').filter({ hasText: '启用头部注视' }).locator('input[type=checkbox]');
  await lookToggle.check();
  await posePanel.getByRole('button', { name: '在 3D 中拖动注视目标', exact: true }).click();
  await page.locator('.viewport-shell[data-rig-selection="控制器:headLookAt"]').waitFor();
  await posePanel.getByRole('button', { name: /当前帧姿势关键帧/ }).click();
  await posePanel.getByRole('button', { name: '左右镜像', exact: true }).click();
  const poseName = posePanel.getByPlaceholder('例如：右手扶桌');
  await poseName.fill('审计自定义姿势');
  await posePanel.getByRole('button', { name: '保存当前姿势', exact: true }).click();
  await posePanel.getByRole('button', { name: '审计自定义姿势', exact: true }).waitFor();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  if (await posePanel.getByRole('button', { name: '审计自定义姿势', exact: true }).count()) throw new Error('调姿 Undo 没有撤销自定义姿势保存。');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await posePanel.getByRole('button', { name: '审计自定义姿势', exact: true }).waitFor();
  await shot(page, 'desktop-full-body-posing');
  await page.getByRole('button', { name: '退出人物调姿', exact: true }).click();

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

  await clickMode(page, '时间线 / 声音');
  await page.locator('.timeline-page').waitFor({ state: 'visible' });
  await page.getByText('摄影机', { exact: true }).first().waitFor();
  await page.getByText(/姿势关键帧：1/).first().waitFor();
  const dialogue = page.locator('.audio-editor-track').filter({ hasText: '对白' });
  await dialogue.locator('input[type=file]').setInputFiles({ name: 'audit-dialogue.wav', mimeType: 'audio/wav', buffer: minimalWav() });
  await page.getByText(/已解码、生成波形并加入对白轨/).waitFor({ timeout: 10_000 });
  await dialogue.locator('.audio-clip-card').first().waitFor();
  const markerInput = page.getByPlaceholder(/添加标记/);
  await markerInput.fill('审计标记');
  await page.getByRole('button', { name: '+ 标记', exact: true }).click();
  const noteInput = page.getByPlaceholder(/添加导演备注/);
  await noteInput.fill('审计导演备注');
  await page.getByRole('button', { name: '+ 备注', exact: true }).click();
  await page.getByText(/审计标记/).waitFor(); await page.getByText(/审计导演备注/).waitFor();

  const otioDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 OTIO', exact: true }).click();
  const otioDownload = await otioDownloadPromise;
  const otioText = await fs.readFile(await otioDownload.path(), 'utf8');
  if (!otioText.includes('审计标记') || !otioText.includes('审计导演备注') || !otioText.includes('audit-dialogue.wav')) throw new Error('OTIO 导出未保留剪辑状态。');
  await page.locator('.editorial-export-bar input[type=file]').setInputFiles({ name: 'roundtrip.otio', mimeType: 'application/json', buffer: Buffer.from(otioText) });
  await page.getByText(/OTIO 已导入/).waitFor();

  const mp4DownloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: '导出 MP4 参考片', exact: true }).click();
  const mp4Download = await mp4DownloadPromise;
  const mp4Stat = await fs.stat(await mp4Download.path());
  if (!mp4Download.suggestedFilename().endsWith('.mp4') || mp4Stat.size < 1000) throw new Error('MP4 参考片没有产生有效下载。');
  await page.getByText(/MP4 已完成/).waitFor({ timeout: 10_000 });
  await shot(page, 'desktop-timeline');

  await clickMode(page, '资产库');
  await page.getByText('资产导入 · GLB / FBX', { exact: true }).waitFor();
  const fileInput = page.locator('.asset-file-picker input[type=file]');
  await fileInput.setInputFiles({ name: 'audit-prop.glb', mimeType: 'model/gltf-binary', buffer: minimalGlb() });
  await page.getByText('通过', { exact: true }).waitFor();
  await page.getByRole('button', { name: '导入、校验并注册资产', exact: true }).click();
  await page.getByText(/已注册；SHA-256/).waitFor();
  await page.getByText('audit-prop@v001', { exact: true }).waitFor();
  await shot(page, 'desktop-assets');

  await clickMode(page, '协作 / 审片');
  await page.getByText('认证协作', { exact: true }).waitFor();
  const token = issueCollaborationToken({ sub: 'local-owner', name: 'CI 导演', projectId: 'project-demo', role: 'owner', department: 'direction' }, AUTH_SECRET, 3600);
  await page.getByLabel('已签名协作令牌').fill(token);
  await page.getByRole('button', { name: '连接', exact: true }).click();
  await page.locator('.connection-state.connected').waitFor({ timeout: 10_000 });
  await page.getByText('CI 导演', { exact: true }).first().waitFor();
  await page.getByText(/镜头锁 · 当前用户持有/).waitFor({ timeout: 10_000 });
  await page.locator('.status-row button').filter({ hasText: '审片中' }).click();
  await page.locator('.status-row button.active').filter({ hasText: '审片中' }).waitFor();
  await page.locator('.status-row button').filter({ hasText: '已批准' }).click();
  await page.locator('.status-row button.active').filter({ hasText: '已批准' }).waitFor();
  await shot(page, 'desktop-review-approved');

  await clickMode(page, '3D 导演台');
  await page.getByText(/已批准 · 只读/).first().waitFor();
  if (!(await page.getByRole('button', { name: '撤销' }).isDisabled())) throw new Error('已批准镜头仍允许撤销。');
  if (!(await page.getByRole('button', { name: '人物调姿', exact: true }).isDisabled())) throw new Error('已批准镜头仍允许进入人物调姿。');
  const inspectorFrameInput = page.locator('.inspector input[type=number]').first();
  if (!(await inspectorFrameInput.isDisabled())) throw new Error('已批准镜头 Inspector 仍可编辑。');
  await shot(page, 'desktop-approved-readonly');

  await clickMode(page, '制作管线');
  await page.getByText('制作管线互操作', { exact: true }).waitFor();
  const usdDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 USDA', exact: true }).click();
  const usdText = await fs.readFile(await (await usdDownload).path(), 'utf8');
  for (const required of ['metersPerUnit = 1', 'float focalLength = 0.5', 'float horizontalAperture = 0.36', 'float verticalAperture = 0.2025', 'matrix4d xformOp:transform', 'custom double pds:frameAspect = 1.777777778']) {
    if (!usdText.includes(required)) throw new Error(`USDA 缺少物理摄影机合约：${required}`);
  }
  await shot(page, 'desktop-pipeline');

  await clickMode(page, 'AI 制作');
  await page.getByText('AI 制作', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: '生成故事板', exact: true }).click();
  await page.getByText(/故事板已生成：/).waitFor({ timeout: 10_000 });
  await page.locator('.ai-output').filter({ hasText: '故事板 · 已生成' }).waitFor();
  await page.locator('.ai-output img').first().waitFor({ state: 'visible', timeout: 10_000 });
  await shot(page, 'desktop-ai');

  const projectDownload = page.waitForEvent('download');
  await page.getByTitle('导出工程').click();
  const projectFile = await projectDownload;
  if (projectFile.suggestedFilename() !== 'professional-director-station.pds.json') throw new Error(`工程文件名异常：${projectFile.suggestedFilename()}`);
  const exported = JSON.parse(await fs.readFile(await projectFile.path(), 'utf8'));
  if (exported.schemaVersion !== 'pds-1' || exported.id !== 'project-demo') throw new Error('工程 JSON 基础完整性失败。');
  const exportedShot = exported.sequences[0].shots[0];
  if (exportedShot.status !== 'APPROVED' || Math.abs(exportedShot.frameAspect - 16 / 9) > 1e-9) throw new Error('审批状态或权威画幅未保留。');
  const riggedActor = exportedShot.actors[0];
  if (!(riggedActor.posePath?.length > 0)) throw new Error('人物姿势关键帧没有进入工程导出。');
  const rigFrame = riggedActor.posePath[0].rig;
  if (!rigFrame.ik.leftHand.enabled || !rigFrame.ik.leftHand.locked || !rigFrame.ik.leftHand.lockedWorldTarget) throw new Error('左手 IK 世界空间锁定没有进入工程数据。');
  if (!rigFrame.headLookAt.enabled) throw new Error('头部注视状态没有进入工程数据。');
  if (!exported.customPoses?.some((pose) => pose.name === '审计自定义姿势')) throw new Error('自定义姿势没有进入工程导出。');
  if (!exported.assets.some((asset) => asset.id === 'audit-prop')) throw new Error('导入 GLB 资产没有进入工程导出。');
  if (!exported.ai.outputs.some((output) => output.status === 'generated')) throw new Error('AI 故事板 provenance 没有进入工程导出。');
  if (!exportedShot.audio.some((clip) => clip.name.includes('audit-dialogue'))) throw new Error('音频片段没有进入工程导出。');
  await assertNoHorizontalOverflow(page, 'desktop final');

  const mobile = await context.newPage();
  const mobileErrors = [];
  mobile.on('pageerror', (error) => mobileErrors.push(`pageerror: ${error.message}`));
  mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(`console.error: ${message.text()}`); });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mobile.getByText('专业导演工作站', { exact: true }).waitFor();
  await clickMode(mobile, '3D 导演台');
  await mobile.locator('.viewport canvas').waitFor({ state: 'visible' });
  await mobile.locator('[data-character-status]').filter({ hasText: '开源正式角色已加载' }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(mobile, 'mobile 3d'); await shot(mobile, 'mobile-3d');
  await clickMode(mobile, '资产库');
  await mobile.getByText('资产导入 · GLB / FBX', { exact: true }).waitFor();
  await assertNoHorizontalOverflow(mobile, 'mobile assets'); await shot(mobile, 'mobile-assets');
  await clickMode(mobile, 'AI 制作');
  await mobile.getByText('AI 制作', { exact: true }).first().waitFor();
  await assertNoHorizontalOverflow(mobile, 'mobile ai'); await shot(mobile, 'mobile-ai');
  if (mobileErrors.length) throw new Error(`移动端浏览器错误：\n${mobileErrors.join('\n')}`);
  await mobile.close();

  if (browserErrors.length) throw new Error(`桌面浏览器错误：\n${browserErrors.join('\n')}`);
  console.log('PDS 1.1 Chromium 正式人物 / FK-IK / 中文全流程审计通过');
} finally {
  await context.close();
  await browser.close();
}
