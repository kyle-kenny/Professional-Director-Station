import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.PDS_E2E_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/?pds-audit=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__pdsAuditCaptureStageRenderPasses === 'function');
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
  console.log(`PDS Stage render-pass Chromium audit PASSED · ${result.shotId} F${result.frame} · ${result.bundleHashSha256.slice(0, 12)}`);
} finally {
  await browser.close();
}
