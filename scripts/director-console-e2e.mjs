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

async function expectSelectionKind(kind) {
  await page.locator(`[data-selection-inspector][data-selection-kind="${kind}"]`).waitFor({ state: 'visible' });
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '3D 导演台', exact: true }).click();
  await page.locator('.director-light-dock').waitFor({ state: 'visible' });
  await page.locator('[data-character-status]').filter({ hasText: '开源正式角色已加载' }).waitFor({ timeout: 20_000 });

  const existing = page.locator('.director-light-existing > button');
  const initialCount = await existing.count();

  // Director structure toolbar: each guide is independently switchable and camera frustum can be hidden without hiding the camera entity.
  const guideToolbar = page.locator('[data-director-guide-toolbar]');
  await guideToolbar.waitFor({ state: 'visible' });
  for (const id of ['grid', 'world-axes', 'camera-frustum', 'camera-axis', 'actor-height', 'axis-180', 'look-lines', 'motion-paths']) {
    if (await guideToolbar.locator(`[data-guide-toggle="${id}"]`).count() !== 1) throw new Error(`导演辅助工具栏缺少 ${id}。`);
  }
  const frustumToggle = guideToolbar.locator('[data-guide-toggle="camera-frustum"]');
  if (await frustumToggle.getAttribute('aria-pressed') !== 'true') throw new Error('摄影机视锥默认没有开启。');
  await frustumToggle.click();
  if (await frustumToggle.getAttribute('aria-pressed') !== 'false') throw new Error('摄影机视锥无法单独隐藏。');
  await frustumToggle.click();

  // Direct viewport picking: camera and actor must be selectable and right inspector must follow the selected subject.
  await clickWorld({ x: 0, y: 1.55, z: 5.8 });
  if (!(await activeSceneTreeButton('A Cam'))) throw new Error('直接点击 3D 摄影机实体没有选中摄影机。');
  await expectSelectionKind('camera');
  const cameraProperties = page.locator('[data-subject-properties="camera"]');
  await cameraProperties.getByText('主体属性 · 摄影机').waitFor();
  await pressShortcut('e');
  const rotateButton = page.locator('.viewport-toolbar button[title="E"]');
  if (!(await rotateButton.evaluate((node) => node.classList.contains('active')))) throw new Error('选中摄影机后 E 没有进入旋转模式。');
  await pressShortcut('Delete');
  await page.getByText('主摄影机是当前镜头的必需对象').waitFor();
  if (!(await activeSceneTreeButton('A Cam'))) throw new Error('保护主摄影机时不应丢失当前选择。');

  const focusInput = cameraProperties.locator('.number-field').filter({ hasText: '对焦距离（米）' }).locator('input');
  await focusInput.fill('2'); await focusInput.press('Enter');
  await page.waitForTimeout(100);
  const originalFocus = Number(await focusInput.inputValue());

  await clickWorld({ x: -1.3, y: 1.45, z: 0 });
  if (!(await activeSceneTreeButton('角色 A'))) throw new Error('直接点击正式 SkinnedMesh 人物没有选中角色 A。');
  await expectSelectionKind('actor');
  const actorProperties = page.locator('[data-subject-properties="actor"]');
  await actorProperties.getByText('主体属性 · 场面调度').waitFor();
  await pressShortcut('w');
  const translateButton = page.locator('.viewport-toolbar button[title="W"]');
  if (!(await translateButton.evaluate((node) => node.classList.contains('active')))) throw new Error('导演视图选中人物后 W 没有进入人物移动模式。');

  // Camera assistant: focus the selected actor, then inspect the written camera value from the camera's focused inspector.
  const cameraAssistant = page.locator('[data-camera-assistant]');
  await cameraAssistant.waitFor({ state: 'visible' });
  const assistantText = await cameraAssistant.textContent();
  if (!assistantText?.includes('景深范围') || !assistantText.includes('超焦距') || !assistantText.includes('视场角')) throw new Error('摄影助手缺少视场角 / 景深 / 超焦距读数。');
  await cameraAssistant.getByRole('button', { name: '对焦选中人物', exact: true }).click();
  await page.waitForTimeout(100);
  await clickWorld({ x: 0, y: 1.55, z: 5.8 });
  await expectSelectionKind('camera');
  const actorFocus = Number(await page.locator('[data-subject-properties="camera"] .number-field').filter({ hasText: '对焦距离（米）' }).locator('input').inputValue());
  if (!Number.isFinite(actorFocus) || actorFocus <= 0 || actorFocus < originalFocus + 1) throw new Error('“对焦选中人物”没有把人物焦平面距离写入摄影机。');
  await cameraAssistant.getByRole('button', { name: '对焦镜头目标', exact: true }).click();
  await page.waitForTimeout(100);
  const targetFocus = Number(await page.locator('[data-subject-properties="camera"] .number-field').filter({ hasText: '对焦距离（米）' }).locator('input').inputValue());
  if (!Number.isFinite(targetFocus) || targetFocus <= 0) throw new Error('“对焦镜头目标”没有写入有效对焦距离。');
  await cameraAssistant.getByRole('button', { name: '超焦距', exact: true }).click();
  await page.waitForTimeout(100);
  const hyperfocalFocus = Number(await page.locator('[data-subject-properties="camera"] .number-field').filter({ hasText: '对焦距离（米）' }).locator('input').inputValue());
  if (!Number.isFinite(hyperfocalFocus) || hyperfocalFocus <= 0) throw new Error('“超焦距”没有写入有效距离。');
  if (!(await cameraAssistant.textContent())?.includes('∞')) throw new Error('对焦超焦距后，摄影助手没有显示无穷远远景深。');

  // Add one tangible area light: selection inspector must switch to that exact light and expose independent controls.
  await page.locator('[data-light-preset="key-area"]').click();
  await page.locator('.director-selected-light').filter({ hasText: '主光 1' }).waitFor();
  if (await existing.count() !== initialCount + 1) throw new Error('一键加入主光后，镜头灯具数量没有增加。');
  await expectSelectionKind('light');
  const inspectorLight = page.locator('[data-subject-properties="light"]');
  await inspectorLight.getByText('主体属性 · 区域光').waitFor();
  const inspectorNumbers = inspectorLight.locator('input[type=number]');
  const initialAreaPosition = {
    x: Number(await inspectorNumbers.nth(2).inputValue()),
    y: Number(await inspectorNumbers.nth(3).inputValue()),
    z: Number(await inspectorNumbers.nth(4).inputValue()),
  };

  // Change selection to camera, then reselect the physical area-light body directly from 3D.
  await clickWorld({ x: 0, y: 1.55, z: 5.8 });
  await expectSelectionKind('camera');
  await clickWorld(initialAreaPosition);
  await expectSelectionKind('light');
  await page.locator('.director-selected-light').filter({ hasText: '主光 1' }).waitFor();
  await pressShortcut('e');
  if (!(await rotateButton.evaluate((node) => node.classList.contains('active')))) throw new Error('可定向灯具按 E 后没有进入灯头旋转模式。');

  const activeLightNumbers = page.locator('[data-subject-properties="light"] input[type=number]');
  const intensity = activeLightNumbers.first();
  await intensity.fill('6.5'); await intensity.press('Enter');
  await page.locator('.director-selected-light').filter({ hasText: '6.50' }).waitFor();

  const beforeTopY = Number(await activeLightNumbers.nth(3).inputValue());
  await page.locator('[data-light-direction="top"]').click();
  await page.waitForTimeout(100);
  const afterTopY = Number(await activeLightNumbers.nth(3).inputValue());
  if (!(afterTopY > beforeTopY + 0.5)) throw new Error('“上”方向快捷布光没有真正移动灯具。');
  const beforeBackZ = Number(await activeLightNumbers.nth(4).inputValue());
  await page.locator('[data-light-direction="back"]').click();
  await page.waitForTimeout(100);
  const afterBackZ = Number(await activeLightNumbers.nth(4).inputValue());
  if (Math.abs(afterBackZ - beforeBackZ) < 0.5) throw new Error('“后”方向快捷布光没有真正改变灯具位置。');

  await pressShortcut('Delete');
  if (await existing.count() !== initialCount) throw new Error('直接选中灯具后 Delete 没有删除灯具。');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(120);
  if (await existing.count() !== initialCount + 1) throw new Error('Delete 删除灯具没有进入 Undo 历史。');

  await page.locator('.director-light-existing > button').filter({ hasText: '主光 1' }).click();
  await expectSelectionKind('light');
  await page.getByRole('button', { name: '复制灯具', exact: true }).click();
  await page.locator('.director-selected-light').filter({ hasText: '主光 1 副本' }).waitFor();
  if (await existing.count() !== initialCount + 2) throw new Error('复制灯具没有生成独立灯具。');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  if (await existing.count() !== initialCount + 1) throw new Error('删除灯具后数量不正确。');

  await page.locator('[data-light-preset="ambient"]').click();
  await page.locator('.director-selected-light').filter({ hasText: '环境 1' }).waitFor();
  await expectSelectionKind('light');
  await page.locator('[data-subject-properties="light"]').getByText('环境光只负责最低照度').waitFor();
  if (await page.getByRole('button', { name: '瞄准人物中心', exact: true }).count()) throw new Error('环境光错误暴露了方向瞄准操作。');
  if (await page.locator('[data-light-direction]').count()) throw new Error('环境光错误暴露了空间方向快捷键。');
  if (await existing.count() !== initialCount + 2) throw new Error('环境光没有加入镜头。');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(100);
  if (await existing.count() !== initialCount + 1) throw new Error('灯光新增没有进入工程 Undo。');

  // Pose verification comes last: stock archery pose now uses height-scaled hand IK.
  await clickWorld({ x: -1.3, y: 1.45, z: 0 });
  if (!(await activeSceneTreeButton('角色 A'))) throw new Error('灯光操作后无法从 3D 重新选中角色 A。');
  await expectSelectionKind('actor');
  const actorInspector = page.locator('[data-subject-properties="actor"]');
  const poseSelect = actorInspector.locator('select').first();
  await poseSelect.selectOption('archery-draw');
  await page.waitForTimeout(120);
  if (await poseSelect.inputValue() !== 'archery-draw') throw new Error('拉弓满弦姿势没有应用到选中人物。');
  await actorInspector.getByText('需要落手位的预设已使用身高比例 IK').waitFor();

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop-director-tangible-equipment.png'), fullPage: false });
  if (errors.length) throw new Error(`3D 导演台出现浏览器错误：${errors.join(' | ')}`);
  console.log('PDS 3D 导演台 Chromium 旅程通过：主体专属 Inspector、导演视图人物移动、八类结构辅助线/机位视锥隐藏、摄影助手、身高比例手部 IK、电影化灯光、实体拾取、Delete/Undo 与六方向布光均可用。');
} finally {
  await browser.close();
}
