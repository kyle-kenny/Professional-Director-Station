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
  await page.locator('.director-light-dock').waitFor({ state: 'visible' });
  await page.locator('[data-character-status]').filter({ hasText: '开源正式角色已加载' }).waitFor({ timeout: 20_000 });

  const existing = page.locator('.director-light-existing > button');
  const initialCount = await existing.count();

  await page.locator('[data-light-preset="key-area"]').click();
  await page.locator('.director-selected-light').filter({ hasText: '主光 1' }).waitFor();
  if (await existing.count() !== initialCount + 1) throw new Error('一键加入主光后，镜头灯具数量没有增加。');
  const inspectorLight = page.locator('.inspector section').filter({ hasText: '灯光 · 主光 1' });
  await inspectorLight.waitFor();
  const inspectorNumbers = inspectorLight.locator('input[type=number]');
  const intensity = inspectorNumbers.first();
  await intensity.fill('6.5'); await intensity.press('Enter');
  await page.locator('.director-selected-light').filter({ hasText: '6.50' }).waitFor();

  // LibTV-style six-direction shortcut must move the physical light, not just change a label.
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

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop-director-light-console.png'), fullPage: false });
  if (errors.length) throw new Error(`3D 导演台出现浏览器错误：${errors.join(' | ')}`);
  console.log('PDS 3D 导演台 Chromium 灯光旅程通过：一键摆灯、六方向布光、选择、强度编辑、复制、删除、环境光与 Undo 均可用。');
} finally {
  await browser.close();
}
