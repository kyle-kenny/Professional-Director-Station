import fs from 'node:fs';

const required = {
  'src/domain/pipeline.ts': ['OpenUSD-26.08', "z.literal('2.5')", "z.literal('2.0')", "z.literal('1.39')", "z.literal('1.39.5')"],
  'src/pipeline/usd.ts': ['#usda 1.0', 'metersPerUnit = 1', 'upAxis = "Y"', 'timeCodesPerSecond', 'parsePdsUsda'],
  'src/pipeline/materialx.ts': ['<materialx version=', 'standard_surface', 'materialassign', 'parsePdsMaterialX'],
  'src/pipeline/color.ts': ['pds-color-1', 'ACES2065-1', 'ACEScg', 'createAcesMetadataSidecar'],
  'src/pipeline/adapters.ts': ['blender', 'maya', 'houdini', 'unreal', 'nuke', 'resolve', 'pds-pipeline-package-1'],
  'src/pipeline/mediaProxy.ts': ['planMediaProxy', 'targetBitrateMbps', 'audioSampleRate'],
  'src/storage/storageProvider.ts': ['StorageProvider', 'MemoryStorageProvider', 'IndexedDbStorageProvider'],
};
const failures = [];
for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(`${file} missing ${needle}`);
}
if (failures.length) {
  console.error('PDS Gate 4 pipeline smoke FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('PDS Gate 4 pipeline interoperability smoke PASSED');
