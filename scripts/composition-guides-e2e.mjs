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

const SHOT_ASPECT = 16 / 9;
const DEFAULT_ACTOR_A = { x: -1.3, y: 0, z: 0 };

async function persistedActorPosition(actorId = 'actor-a') {
  return page.evaluate((id) => {
    const raw = window.localStorage.getItem('pds.project.v1');
    if (!raw) return null;
    const project = JSON.parse(raw);
    for (const sequence of project.sequences ?? []) {
      for (const shot of sequence.shots ?? []) {
        const actor = shot.actors?.find((item) => item.id === id);
        if (!actor) continue;
        const tolerance = 0.5 / (shot.fps || 24);
        const zeroFrame = actor.path?.find((frame) => Math.abs(frame.time) <= tolerance);
        return zeroFrame?.position ?? actor.transform?.position ?? null;
      }
    }
    return null;
  }, actorId);
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
  if (await overlay.locator('[data-composition-guide="golden-ratio"] line').count() !== 4) throw new Error('黄金分割没有渲染四条 0.382 / 0.618 构图线。');
  await thirds.click();
  if (await overlay.locator('[data-composition-guide="thirds"]').count() !== 0) throw new Error('三分法无法独立隐藏。');
  await toolbar.locator('[data-composition-hide-all]').click();
  if (await overlay.locator('[data-composition-guide]').count() !== 0) throw new Error('隐藏构图没有清空全部构图线。');
  await toolbar.locator('[data-composition-common]').click();
  await overlay.locator('[data-composition-guide="thirds"]').waitFor({ state: 'visible' });
  await overlay.locator('[data-composition-guide="center-cross"]').waitFor({ state: 'visible' });

  await page.locator('[data-selection-inspector][data-selection-kind="actor"]').waitFor({ state: 'visible' });
  const moveHint = toolbar.locator('[data-shot-actor-move-hint]');
  if (!(await moveHint.textContent())?.includes('直接拖动人物')) throw new Error('镜头构图栏没有显示人物平移提示。');

  const dragHandle = page.locator('[data-shot-actor-drag-handle="actor-a"]');
  await dragHandle.waitFor({ state: 'visible' });
  const handleBox = await dragHandle.boundingBox();
  if (!handleBox || handleBox.width < 30 || handleBox.height < 30) throw new Error('选中人物没有生成可用的镜头拖拽命中区域。');
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height * 0.62;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(({ x, z }) => {
    const raw = localStorage.getItem('pds.project.v1');
    if (!raw) return false;
    const project = JSON.parse(raw);
    const shot = project.sequences?.[0]?.shots?.[0];
    const actor = shot?.actors?.find((item) => item.id === 'actor-a');
    if (!actor) return false;
    const tolerance = 0.5 / (shot.fps || 24);
    const zeroFrame = actor.path?.find((frame) => Math.abs(frame.time) <= tolerance);
    const position = zeroFrame?.position ?? actor.transform?.position;
    return position && Math.hypot(position.x - x, position.z - z) > 0.1;
  }, { x: DEFAULT_ACTOR_A.x, z: DEFAULT_ACTOR_A.z }, { timeout: 5_000 });

  const after = await persistedActorPosition();
  if (!after || Math.hypot(after.x - DEFAULT_ACTOR_A.x, after.z - DEFAULT_ACTOR_A.z) < 0.1) throw new Error('镜头视图拖动人物没有产生实际 X/Z 平移。');
  if (Math.abs(after.y - DEFAULT_ACTOR_A.y) > 0.001) throw new Error('镜头视图人物平移改变了脚底高度，角色被拖离地面。');

  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForFunction(({ x, y, z }) => {
    const raw = localStorage.getItem('pds.project.v1');
    if (!raw) return false;
    const project = JSON.parse(raw);
    const shot = project.sequences?.[0]?.shots?.[0];
    const actor = shot?.actors?.find((item) => item.id === 'actor-a');
    if (!actor) return false;
    const tolerance = 0.5 / (shot.fps || 24);
    const zeroFrame = actor.path?.find((frame) => Math.abs(frame.time) <= tolerance);
    const position = zeroFrame?.position ?? actor.transform?.position;
    return position && Math.abs(position.x - x) < 0.01 && Math.abs(position.y - y) < 0.01 && Math.abs(position.z - z) < 0.01;
  }, DEFAULT_ACTOR_A, { timeout: 5_000 });

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'shot-composition-guides-and-actor-move.png'), fullPage: true });
  await page.getByRole('button', { name: '导演视图', exact: true }).click();
  await toolbar.waitFor({ state: 'detached' });
  await overlay.waitFor({ state: 'detached' });
  if (await page.locator('[data-shot-actor-drag-handle]').count() !== 0) throw new Error('导演视图错误保留了镜头人物拖拽层。');

  if (errors.length) throw new Error(`浏览器控制台错误：${errors.join(' | ')}`);
  console.log('Shot composition passed: frame-aligned thirds/golden ratio/safe guides plus selected-actor grounded drag and single-step Undo.');
} finally {
  await browser.close();
}
