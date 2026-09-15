import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.PDS_E2E_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/?pds-audit=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__pdsAuditCaptureStageRenderPasses === 'function' && typeof window.__pdsAuditSeedStageAsset === 'function');
  const result = await page.evaluate(() => window.__pdsAuditCaptureStageRenderPasses?.());
  assert.ok(result, 'Stage render-pass audit hook returned no result');
  assert.equal(result.schema, 'pds-stage-render-passes-1');
  assert.match(result.bundleHashSha256, /^[0-9a-f]{64}$/);
  for (const kind of ['sceneDepth', 'sceneNormal', 'sceneMask', 'sceneEdge']) {
    const pass = result.passes[kind];
    assert.ok(pass, `missing ${kind}`);
    assert.ok(pass.prefix.startsWith('iVBORw0KGgo'), `${kind} is not PNG base64`);
    assert.ok(pass.base64Length > 100, `${kind} PNG is unexpectedly small`);
    assert.match(pass.contentHashSha256, /^[0-9a-f]{64}$/, `${kind} missing SHA-256`);
  }
  assert.notEqual(result.passes.sceneDepth.contentHashSha256, result.passes.sceneNormal.contentHashSha256);
  assert.notEqual(result.passes.sceneMask.contentHashSha256, result.passes.sceneEdge.contentHashSha256);

  const seeded = await page.evaluate(() => window.__pdsAuditSeedStageAsset?.());
  assert.ok(seeded, 'Stage asset audit seed returned no result');
  assert.equal(seeded.stageAssetCount, 1);
  assert.match(seeded.assetHashSha256, /^[0-9a-f]{64}$/);
  assert.match(seeded.afterBundleHashSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(seeded.beforeMaskHashSha256, seeded.afterMaskHashSha256, 'Stage asset geometry did not affect Scene Mask');

  await page.waitForFunction(() => document.querySelector('[data-stage-asset-status]')?.textContent?.includes('1/1 已加载'));
  const inspector = page.locator('[data-selection-kind="stage-asset"]');
  await inspector.waitFor({ state: 'visible' });
  const xInput = page.locator('[data-subject-properties="stage-asset"] label', { hasText: '位置 X（米）' }).locator('input');
  await xInput.fill('1.4');
  await xInput.blur();
  await page.waitForTimeout(100);
  const moved = await page.evaluate(() => window.__pdsAuditCaptureStageRenderPasses?.());
  assert.ok(moved, 'moved Stage asset render-pass capture returned no result');
  assert.notEqual(moved.passes.sceneMask.contentHashSha256, seeded.afterMaskHashSha256, 'Inspector transform did not change Scene Mask');

  console.log(`PDS Stage render-pass + Stage asset Chromium audit PASSED · ${result.shotId} F${result.frame} · ${moved.bundleHashSha256.slice(0, 12)}`);
} finally {
  await browser.close();
}
