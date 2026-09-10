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

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '3D 导演台', exact: true }).click();

  const toolbar = page.locator('[data-director-guide-toolbar]');
  await toolbar.waitFor({ state: 'visible' });
  const ids = ['thirds', 'golden-ratio', 'center-cross', 'horizon', 'diagonals', 'action-safe', 'title-safe'];
  for (const id of ids) {
    const toggle = toolbar.locator(`[data-composition-toggle="${id}"]`);
    await toggle.waitFor({ state: 'visible' });
    if (await toggle.count() !== 1) throw new Error(`导演构图工具栏缺少 ${id}。`);
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
  await golden.click();
  if (await golden.getAttribute('aria-pressed') !== 'true') throw new Error('黄金分割无法开启。');
  await overlay.locator('[data-composition-guide="golden-ratio"]').waitFor({ state: 'visible' });
  const goldenLines = overlay.locator('[data-composition-guide="golden-ratio"] line');
  if (await goldenLines.count() !== 4) throw new Error('黄金分割没有渲染四条 0.382 / 0.618 构图线。');

  await thirds.click();
  if (await overlay.locator('[data-composition-guide="thirds"]').count() !== 0) throw new Error('三分法无法独立隐藏。');
  await toolbar.locator('[data-composition-hide-all]').click();
  if (await overlay.locator('[data-composition-guide]').count() !== 0) throw new Error('隐藏构图没有清空全部构图线。');
  await toolbar.locator('[data-composition-common]').click();
  await overlay.locator('[data-composition-guide="thirds"]').waitFor({ state: 'visible' });
  await overlay.locator('[data-composition-guide="center-cross"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: '镜头视图', exact: true }).click();
  await overlay.waitFor({ state: 'detached' });
  if (await page.locator('[data-composition-guide-overlay]').count() !== 0) throw new Error('镜头视图错误保留了导演构图叠加。');

  await page.getByRole('button', { name: '导演视图', exact: true }).click();
  await page.locator('[data-composition-guide-overlay]').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'director-composition-guides.png'), fullPage: true });

  if (errors.length) throw new Error(`浏览器控制台错误：${errors.join(' | ')}`);
  console.log('Director composition guides passed: thirds, golden ratio, center, horizon, diagonals, safe frames, independent visibility and director-only overlay.');
} finally {
  await browser.close();
}
