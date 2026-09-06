import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['src', 'scripts'];
const forbidden = [
  /\/Users\//,
  /\/home\//,
  /\/tmp\//,
  /process\.env\.HOME/,
  /\bchmod\b/,
];
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const pattern of forbidden) if (pattern.test(text)) failures.push(`${path.relative(root, full)} contains POSIX-only assumption: ${pattern}`);
    }
  }
}
for (const item of scanRoots) walk(path.join(root, item));
for (const required of ['start-windows.cmd', '.github/workflows/ci.yml']) {
  if (!fs.existsSync(path.join(root, required))) failures.push(`missing Windows support file: ${required}`);
}

if (failures.length) {
  console.error('PDS Windows compatibility gate FAILED');
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}
console.log(`PDS Windows compatibility gate PASSED on ${process.platform} (${process.arch})`);
