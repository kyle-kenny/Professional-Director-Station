import fs from 'node:fs';

const required = {
  'src/domain/ai.ts': ['script-breakdown', 'storyboard', 'video', 'pds-http', 'local-structural', 'sourceShotHashSha256', 'controlHashSha256'],
  'src/ai/scriptBreakdown.ts': ['breakDownScript', 'sourceScriptHashSha256'],
  'src/ai/controlAnalysis.ts': ['pds-ai-controls-1', 'cameraReference', 'pose:', 'depth:', 'lineart:', 'controlBundleHash'],
  'src/ai/generation.ts': ['pds-ai-generation-1', 'generateLocalStructuralStoryboard', 'invokePdsAiEndpoint', 'runtimeToken', 'promptHashSha256'],
  'src/ai/provenance.ts': ['approveGeneratedMedia', 'approvedGeneratedMediaToAsset', "source: 'generated'"],
  'src/storage/aiMediaStore.ts': ['pds://ai/', 'putAiGeneratedMedia'],
  'src/store/aiRegistry.ts': ['runScriptBreakdown', 'generateAiMedia', 'approveAiOutput', 'promoteApprovedAiOutputToAsset'],
  'src/components/AIWorkspace.tsx': ['STRUCTURE ANALYSIS', 'MODEL PROFILE / GENERATION', 'GENERATED MEDIA / APPROVAL', 'runtimeToken'],
  'src/tests/aiProduction.test.ts': ['Approved source Shot', 'runtime-secret', 'local-structural-v1'],
};
const failures = [];
for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(`${file} missing ${needle}`);
}
const model = fs.readFileSync('src/domain/model.ts', 'utf8');
for (const contract of ['ai: aiProductionStateSchema', "'storyboard'", "'video'", "'ai'"]) if (!model.includes(contract)) failures.push(`model missing ${contract}`);
if (failures.length) {
  console.error('PDS Gate 5 AI production smoke FAILED');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('PDS Gate 5 AI production smoke PASSED');
