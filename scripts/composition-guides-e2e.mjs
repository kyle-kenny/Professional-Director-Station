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

const SHOT_CAMERA = { position: { x: 0, y: 1.55, z: 5.8 }, target: { x: 0, y: 1.35, z: 0 }, focalLengthMm: 50, sensorWidthMm: 36 };
const SHOT_ASPECT = 16 / 9;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const normalize = (v) => { const length = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / length, y: v.y / length, z: v.z / length }; };

function fitFrame(width, height, aspect) {
  if (width / height > aspect) {
    const frameWidth = height * aspect;
    return { x: (width - frameWidth) / 2, y: 0, width: frameWidth, height };
  }
  const frameHeight = width / aspect;
  return { x: 0, y: (height - frameHeight) / 2, width, height: frameHeight };
}

function projectShotPoint(point, box) {
  const frame = fitFrame(box.width, box.height, SHOT_ASPECT);
  const forward = normalize(subtract(SHOT_CAMERA.target, SHOT_CAMERA.position));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, forward));
  const offset = subtract(point, SHOT_CAMERA.position);
  const depth = dot(offset, forward);
  const sensorHeight = SHOT_CAMERA.sensorWidthMm / SHOT_ASPECT;
  const verticalFov = 2 * Math.atan(sensorHeight / (2 * SHOT_CAMERA.focalLengthMm));
  const halfY = Math.tan(verticalFov / 2) * depth;
  const halfX = halfY * SHOT_ASPECT;
  const ndcX = dot(offset, right) / halfX;
  const ndcY = dot(offset, up) / halfY;
  return {
    x: box.x + frame.x + (ndcX + 1) * 0.5 * frame.width,
    y: box.y + frame.y + (1 - (ndcY + 1) * 0.5) * frame.height,
  };
}

function actorPositionInput(axis) {
  return page.locator('[data-subject-properties="actor"] .number-field').filter({ hasText: `位置 ${axis}（米）` }).locator('input');
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '3D 导演台', exact: true }).click();
  await page.locator('[data-character-status]').filter({ hasText: '开源正式角色已加载' }).waitFor({ timeout: 20_000 });

  if (await page.locator('[data-shot-composition-toolbar]').count() !== 0) throw new Error('导演视图不应显示镜头构图工具栏。');
  if (await page.locator('[data-composition-guide-overlay]').count() !== 0) throw new Error('导演视图不应显示镜头构图叠加。');

  await page.getByRole('button', { name: '镜头视图', exact: true }).click();
  const toolbar = page.locator('[data-shot-composition-toolbar]');
  await toolbar.waitFor({ state: 'visible' });
  const ids = ['thirds', 'golden-ratio', 'center-cross', 'horizon', 'diagonals', 'action-safe', 'title-safe'];
  for (const id of ids) {
    const toggle = toolbar.locator(`[data-composition-toggle="${id}"]`);
    await toggle.waitFor({ state: 'visible' });
    if (await toggle.count() !== 1) throw new Error(`镜头构图工具栏缺少 ${id}。`);
  }

  const thirds = toolbar.locator('[data-composition-toggle="thirds"]');
  const golden = toolbar.locator('[data-composition-toggle="golden-ratio"]');
  const center = toolbar.locator('[data-composition-toggle="center-cross"]');
  if (await thirds.getAttribute('aria-pressed') !== 'true') throw new Error('三分法默认没有开启。');
  if (await center.getAttribute('aria-pressed') !== 'true') throw new Error('中心十字默认没有开启。');
  if (await golden.getAttribute('aria-pressed') !== 'false') throw new Error('黄金分割默认状态错误。');

  const overlay = page.locator('[data-composition-guide-overlay]');
  await overlay.waitFor({ state: 'visible' });
  await overlay.locator('[data-composition-guide="thirds"]').waitFor({ state: 'visible' });
  const frameBox = await page.locator('[data-composition-frame]').boundingBox();
  if (!frameBox || Math.abs(frameBox.width / frameBox.height - SHOT_ASPECT) > 0.01) throw new Error('构图层没有对齐 16:9 镜头有效画幅。');

  await golden.click();
  if (await golden.getAttribute('aria-pressed') !== 'true') throw new Error('黄金分割无法开启。');
  const goldenLines = overlay.locator('[data-composition-guide="golden-ratio"] line');
  if (await goldenLines.count() !== 4) throw new Error('黄金分割没有渲染四条 0.382 / 0.618 构图线。');
  await thirds.click();
  if (await overlay.locator('[data-composition-guide="thirds"]').count() !== 0) throw new Error('三分法无法独立隐藏。');
  await toolbar.locator('[data-composition-hide-all]').click();
  if (await overlay.locator('[data-composition-guide]').count() !== 0) throw new Error('隐藏构图没有清空全部构图线。');
  await toolbar.locator('[data-composition-common]').click();
  await overlay.locator('[data-composition-guide="thirds"]').waitFor({ state: 'visible' });
  await overlay.locator('[data-composition-guide="center-cross"]').waitFor({ state: 'visible' });

  // Default selection is actor A. Drag its visible torso inside shot view; translation must stay grounded and create one undoable edit.
  await page.locator('[data-selection-inspector][data-selection-kind="actor"]').waitFor({ state: 'visible' });
  const beforeX = Number(await actorPositionInput('X').inputValue());
  const beforeY = Number(await actorPositionInput('Y').inputValue());
  const beforeZ = Number(await actorPositionInput('Z').inputValue());
  const canvas = page.locator('.viewport canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('找不到镜头视图 Canvas。');
  const actorPoint = projectShotPoint({ x: beforeX, y: 1.0, z: beforeZ }, canvasBox);
  await page.mouse.move(actorPoint.x, actorPoint.y);
  await page.mouse.down();
  await page.mouse.move(actorPoint.x + 90, actorPoint.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const afterX = Number(await actorPositionInput('X').inputValue());
  const afterY = Number(await actorPositionInput('Y').inputValue());
  const afterZ = Number(await actorPositionInput('Z').inputValue());
  if (Math.hypot(afterX - beforeX, afterZ - beforeZ) < 0.1) throw new Error('镜头视图拖动人物没有产生实际 X/Z 平移。');
  if (Math.abs(afterY - beforeY) > 0.001) throw new Error('镜头视图人物平移改变了脚底高度，角色被拖离地面。');
  if (!(await toolbar.locator('[data-shot-actor-move-hint]').textContent())?.includes('直接拖动人物')) throw new Error('镜头构图栏没有显示人物平移提示。');

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(120);
  const undoX = Number(await actorPositionInput('X').inputValue());
  const undoY = Number(await actorPositionInput('Y').inputValue());
  const undoZ = Number(await actorPositionInput('Z').inputValue());
  if (Math.abs(undoX - beforeX) > 0.01 || Math.abs(undoY - beforeY) > 0.01 || Math.abs(undoZ - beforeZ) > 0.01) throw new Error('镜头视图人物拖动没有形成单次可撤销编辑。');

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'shot-composition-guides-and-actor-move.png'), fullPage: true });
  await page.getByRole('button', { name: '导演视图', exact: true }).click();
  await toolbar.waitFor({ state: 'detached' });
  await overlay.waitFor({ state: 'detached' });

  if (errors.length) throw new Error(`浏览器控制台错误：${errors.join(' | ')}`);
  console.log('Shot composition passed: frame-aligned thirds/golden ratio/safe guides plus direct grounded actor translation with single-step Undo.');
} finally {
  await browser.close();
}
