import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sourcePath = new URL('./visual-smoke.mjs', import.meta.url);
const source = await fs.readFile(sourcePath, 'utf8');
const needle = "  await page.goto(BASE_URL, { waitUntil: 'networkidle' });\n  await page.getByText('专业导演工作站', { exact: true }).waitFor();";
const replacement = `  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });\n  try {\n    await page.locator('.app').waitFor({ state: 'attached', timeout: 30_000 });\n    await page.locator('.topbar').waitFor({ state: 'visible', timeout: 30_000 });\n    const productTitle = (await page.locator('.brand strong').textContent())?.trim();\n    if (productTitle !== '专业导演工作站') throw new Error(\`首屏标题不正确：\${productTitle ?? '<missing>'}\`);\n  } catch (error) {\n    const startup = {\n      status: response?.status(),\n      url: page.url(),\n      title: await page.title().catch(() => '<unavailable>'),\n      rootHtml: await page.locator('#root').innerHTML().catch(() => '<root unavailable>'),\n      browserErrors,\n    };\n    console.error('PDS Chromium 首屏启动诊断：', JSON.stringify(startup, null, 2));\n    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'startup-failure.png'), fullPage: true }).catch(() => {});\n    throw error;\n  }`;

if (!source.includes(needle)) {
  throw new Error('visual-smoke.mjs 启动片段已变化；请同步 visual-smoke-runner.mjs。');
}

const instrumented = source.replace(needle, replacement);
const tempPath = path.join(os.tmpdir(), `pds-visual-smoke-${process.pid}.mjs`);
await fs.writeFile(tempPath, instrumented, 'utf8');

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tempPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`visual audit terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exit(exitCode);
} finally {
  await fs.rm(tempPath, { force: true });
}
