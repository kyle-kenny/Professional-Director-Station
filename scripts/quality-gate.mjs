import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/domain/model.ts',
  'src/domain/defaultProject.ts',
  'src/domain/actorLibrary.ts',
  'src/engine/DirectorViewport.tsx',
  'src/components/FloorPlanCanvas.tsx',
  'src/components/DirectorFrameCanvas.tsx',
  'src/components/TimelinePanel.tsx',
  'src/collab/collaboration.ts',
  'src/tests/domain.test.ts',
  '.github/workflows/ci.yml',
  'start-windows.cmd',
  'docs/WINDOWS_SUPPORT.md',
  'docs/CHARACTER_LIBRARY.md',
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing: ${file}`);

const model = fs.readFileSync(path.join(root, 'src/domain/model.ts'), 'utf8');
for (const contract of ["schemaVersion: z.literal('pds-1')", "handedness: z.literal('right')", "upAxis: z.literal('Y')", "forwardAxis: z.literal('-Z')", "linearUnit: z.literal('meter')"]) {
  if (!model.includes(contract)) failures.push(`domain contract missing: ${contract}`);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const script of ['build', 'test', 'audit:static', 'check']) if (!packageJson.scripts?.[script]) failures.push(`script missing: ${script}`);


const actorLibrary = fs.readFileSync(path.join(root, 'src/domain/actorLibrary.ts'), 'utf8');
for (const preset of ['boy-child','girl-child','boy-teen','girl-teen','man-adult','woman-adult','man-elderly','woman-elderly']) {
  if (!actorLibrary.includes(`'${preset}'`)) failures.push(`standard cast preset missing: ${preset}`);
}
for (const ageGroup of ["'child'", "'teen'", "'adult'", "'elderly'"]) {
  if (!model.includes(ageGroup)) failures.push(`actor age group contract missing: ${ageGroup}`);
}

const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
if (!ci.includes('windows-latest')) failures.push('Windows CI runner missing');
if (!ci.includes('audit:windows')) failures.push('Windows compatibility audit missing from CI');

const viewport = fs.readFileSync(path.join(root, 'src/engine/DirectorViewport.tsx'), 'utf8');
if (!viewport.includes('geometry?.dispose')) failures.push('3D viewport resource disposal is missing');
if (!viewport.includes('focalLengthToVerticalFovDeg')) failures.push('real lens math is not wired into 3D viewport');

const floor = fs.readFileSync(path.join(root, 'src/components/FloorPlanCanvas.tsx'), 'utf8');
if (!floor.includes('180° ACTION AXIS')) failures.push('floor plan 180-degree teaching/directing aid missing');

const frame = fs.readFileSync(path.join(root, 'src/components/DirectorFrameCanvas.tsx'), 'utf8');
if (!frame.includes('projectWorldToFrame')) failures.push('2D director frame is not derived from 3D camera geometry');

if (failures.length) {
  console.error('PDS static quality gate FAILED');
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}
console.log(`PDS static quality gate PASSED (${required.length} critical files, domain/3D/2D/CI contracts checked)`);
