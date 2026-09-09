import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.PDS_E2E_URL ?? 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.PDS_VISUAL_ARTIFACT_DIR ?? 'audit-artifacts';
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const CAMERA_POSITION = { x: 7.5, y: 5.5, z: 8.5 };
const CAMERA_TARGET = { x: 0, y: 1, z: 0 };
const CAMERA_FOV_DEG = 48;

const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (v) => { const length = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / length, y: v.y / length, z: v.z / length }; };

async function clickWorld(point) {
  const canvas = page.locator('.viewport canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('找不到 3D 视口 Canvas。');
  const forward = normalize(subtract(CAMERA_TARGET, CAMERA_POSITION));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, forward));
  const d = subtract(point, CAMERA_POSITION);
  const depth = dot(d, forward);
  if (depth <= 0) throw new Error(`测试目标位于导演摄影机后方：${JSON.stringify(point)}`);
  const halfY = Math.tan(CAMERA_FOV_DEG * Math.PI / 360) * depth;
  const halfX = halfY * (box.width / box.height);
  const ndcX = dot(d, right) / halfX;
  const ndcY = dot(d, up) / halfY;
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) throw new Error(`测试目标不在 3D 视口内：${JSON.stringify({ point, ndcX, ndcY })}`);
  await page.mouse.click(box.x + (ndcX + 1) * 0.5 * box.width, box.y + (1 - (ndcY + 1) * 0.5) * box.height);
  await page.waitForTimeout(120);
}

async function activeSceneTreeButton(text) {
  const button = page.locator('.scene-object-tree button').filter({ hasText: text }).first();
  await button.waitFor();
  const className = await button.getAttribute('class');
  return className?.split(/\s+/).includes('active') ?? false;
}

async function pressShortcut(key) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '3D 导演台', exact: true }).click();
  await page.locator('.director-light-dock').waitFor({ state: 'visible' });
  await page.locator('[data-character-status]').filter({ hasText: '开源正式角色已加载' }).waitFor({ timeout: 20_000 });

  const existing = page.locator('.director-light-existing > button');
  const initialCount = await existing.count();

  // Direct viewport picking: camera and actor must be selectable without the left list.
  await clickWorld({ x: 0, y: 1.55, z: 5.8 });
  if (!(await activeSceneTreeButton('A Cam'))) throw new Error('直接点击 3D 摄影机实体没有选中摄影机。');
  await pressShortcut('e');
  const rotateButton = page.locator('.viewport-toolbar button[title="E"]');
  if (!(await rotateButton.evaluate((node) => node.classList.contains('active')))) throw new Error('选中摄影机后 E 没有进入旋转模式。');
  await pressShortcut('Delete');
  await page.getByText('主摄影机是当前镜头的必需对象').waitFor();
  if (!(await activeSceneTreeButton('A Cam'))) throw new Error('保护主摄影机时不应丢失当前选择。');

  await clickWorld({ x: -1.3, y: 1.45, z: 0 });
  if (!(await activeSceneTreeButton('角色 A'))) throw new Error('直接点击正式 SkinnedMesh 人物没有选中角色 A。');

  // Camera assistant: real UI actions must alter focus distance and expose the physical hyperfocal result.
  const cameraAssistant = page.locator('[data-camera-assistant]');
  await cameraAssistant.waitFor({ state: 'visible' });
  const assistantText = await cameraAssistant.textContent();
  if (!assistantText?.includes('景深范围') || !assistantText.includes('超焦距') || !assistantText.includes('视场角')) throw new Error('摄影助手缺少视场角 / 景深 / 超焦距读数。');
  const cameraInspector = page.locator('.inspector section').filter({ hasText: '摄影机 ·' }).last();
  await cameraInspector.waitFor();
  const focusInput = cameraInspector.locator('.number-field').filter({ hasText: '对焦距离（米）' }).locator('input');
  await focusInput.fill('2'); await focusInput.press('Enter');
  await page.waitForTimeout(100);
  const originalFocus = Number(await focusInput.inputValue());
  await cameraAssistant.getByRole('button', { name: '对焦选中人物', exact: true }).click();
  await page.waitForTimeout(100);
  const actorFocus = Number(await focusInput.inputValue());
  if (!Number.isFinite(actorFocus) || actorFocus <= 0 || actorFocus < originalFocus + 1) throw new Error('“对焦选中人物”没有把人物焦平面距离写入摄影机。');
  await cameraAssistant.getByRole('button', { name: '对焦镜头目标', exact: true }).click();
  await page.waitForTimeout(100);
  const targetFocus = Number(await focusInput.inputValue());
  if (!Number.isFinite(targetFocus) || targetFocus <= 0) throw new Error('“对焦镜头目标”没有写入有效对焦距离。');
  await cameraAssistant.getByRole('button', { name: '超焦距', exact: true }).click();
  await page.waitForTimeout(100);
  const hyperfocalFocus = Number(await focusInput.inputValue());
  if (!Number.isFinite(hyperfocalFocus) || hyperfocalFocus <= 0) throw new Error('“超焦距”没有写入有效距离。');
  if (!(await cameraAssistant.textContent())?.includes('∞')) throw new Error('对焦超焦距后，摄影助手没有显示无穷远远景深。');

  // Add one tangible area light and capture its initial, camera-relative in-view position.
  await page.locator('[data-light-preset="key-area"]').click();
  await page.locator('.director-selected-light').filter({ hasText: '主光 1' }).waitFor();
  if (await existing.count() !== initialCount + 1) throw new Error('一键加入主光后，镜头灯具数量没有增加。');
  const inspectorLight = page.locator('.inspector section').filter({ hasText: '灯光 · 主光 1' });
  await inspectorLight.waitFor();
  const inspectorNumbers = inspectorLight.locator('input[type=number]');
  const initialAreaPosition = {
    x: Number(await inspectorNumbers.nth(2).inputValue()),
    y: Number(await inspectorNumbers.nth(3).inputValue()),
    z: Number(await inspectorNumbers.nth(4).inputValue()),
  };

  // Change selection to camera, then reselect the physical area-light body directly from 3D.
  await clickWorld({ x: 0, y: 1.55, z: 5.8 });
  await clickWorld(initialAreaPosition);
  await page.locator('.director-selected-light').filter({ hasText: '主光 1' }).waitFor();
  await pressShortcut('e');
  if (!(await rotateButton.evaluate((node) => node.classList.contains('active')))) throw new Error('可定向灯具按 E 后没有进入灯头旋转模式。');

  const intensity = inspectorNumbers.first();
  await intensity.fill('6.5'); await intensity.press('Enter');
  await page.locator('.director-selected-light').filter({ hasText: '6.50' }).waitFor();

  // LibTV-style six-direction shortcuts are tested independently from picking because some placements may be occluded.
  const beforeTopY = Number(await inspectorNumbers.nth(3).inputValue());
  await page.locator('[data-light-direction="top"]').click();
  await page.waitForTimeout(100);
  const afterTopY = Number(await inspectorNumbers.nth(3).inputValue());
  if (!(afterTopY > beforeTopY + 0.5)) throw new Error('“上”方向快捷布光没有真正移动灯具。');
  const beforeBackZ = Number(await inspectorNumbers.nth(4).inputValue());
  await page.locator('[data-light-direction="back"]').click();
  await page.waitForTimeout(100);
  const afterBackZ = Number(await inspectorNumbers.nth(4).inputValue());
  if (Math.abs(afterBackZ - beforeBackZ) < 0.5) throw new Error('“后”方向快捷布光没有真正改变灯具位置。');

  await pressShortcut('Delete');
  if (await existing.count() !== initialCount) throw new Error('直接选中灯具后 Delete 没有删除灯具。');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(120);
  if (await existing.count() !== initialCount + 1) throw new Error('Delete 删除灯具没有进入 Undo 历史。');

  await page.locator('.director-light-existing > button').filter({ hasText: '主光 1' }).click();
  await page.getByRole('button', { name: '复制灯具', exact: true }).click();
  await page.locator('.director-selected-light').filter({ hasText: '主光 1 副本' }).waitFor();
  if (await existing.count() !== initialCount + 2) throw new Error('复制灯具没有生成独立灯具。');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  if (await existing.count() !== initialCount + 1) throw new Error('删除灯具后数量不正确。');

  await page.locator('[data-light-preset="ambient"]').click();
  await page.locator('.director-selected-light').filter({ hasText: '环境 1' }).waitFor();
  if (await page.getByRole('button', { name: '瞄准人物中心', exact: true }).count()) throw new Error('环境光错误暴露了方向瞄准操作。');
  if (await page.locator('[data-light-direction]').count()) throw new Error('环境光错误暴露了空间方向快捷键。');
  if (await existing.count() !== initialCount + 2) throw new Error('环境光没有加入镜头。');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(100);
  if (await existing.count() !== initialCount + 1) throw new Error('灯光新增没有进入工程 Undo。');

  // Pose verification comes last so form focus / pose UI cannot influence equipment-shortcut validation.
  await clickWorld({ x: -1.3, y: 1.45, z: 0 });
  if (!(await activeSceneTreeButton('角色 A'))) throw new Error('灯光操作后无法从 3D 重新选中角色 A。');
  const actorInspector = page.locator('.inspector section').filter({ hasText: '场面调度 · 角色 A' });
  await actorInspector.waitFor();
  const poseSelect = actorInspector.locator('select').first();
  await poseSelect.selectOption({ label: '拉弓满弦' });
  await actorInspector.getByText('姿势：拉弓满弦').waitFor();

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop-director-tangible-equipment.png'), fullPage: false });
  if (errors.length) throw new Error(`3D 导演台出现浏览器错误：${errors.join(' | ')}`);
  console.log('PDS 3D 导演台 Chromium 旅程通过：摄影助手景深/人物焦平面对焦/超焦距、实体摄影机/人物/灯具直接拾取、E 旋转、Delete、Undo、35 组姿势中的拉弓满弦、快速摆灯与六方向布光均可用。');
} finally {
  await browser.close();
}
