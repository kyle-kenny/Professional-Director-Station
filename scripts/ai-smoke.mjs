import fs from 'node:fs';

const required = {
  'src/domain/ai.ts': ['script-breakdown', 'storyboard', 'video', 'pds-http', 'local-structural', 'sourceShotHashSha256', 'controlHashSha256', 'AI 远程端点必须使用 HTTPS'],
  'src/ai/scriptBreakdown.ts': ['breakDownScript', 'sourceScriptHashSha256'],
  'src/ai/controlAnalysis.ts': ['pds-ai-controls-1', 'cameraReference', 'pose:', 'depth:', 'lineart:', 'controlBundleHash', 'humanoidRig', 'rigHashSha256', 'sampleActorRig'],
  'src/ai/generation.ts': ['pds-ai-generation-1', 'generateLocalStructuralStoryboard', 'invokePdsAiEndpoint', 'runtimeToken', 'promptHashSha256', 'controlSequence', 'failedGenerationRecord', '256 MiB safety limit'],
  'src/ai/provenance.ts': ['approveGeneratedMedia', 'approvedGeneratedMediaToAsset', "source: 'generated'", 'sourceShotHashSha256'],
  'src/storage/aiMediaStore.ts': ['pds://ai/', 'putAiGeneratedMedia'],
  'src/store/aiRegistry.ts': ['runScriptBreakdown', 'generateAiMedia', 'failedGenerationRecord', 'approveAiOutput', 'promoteApprovedAiOutputToAsset'],
  'src/components/AIWorkspace.tsx': ['结构分析', '模型配置 / 生成', '生成媒体 / 审批', 'runtimeToken'],
  'src/tests/aiProduction.test.ts': ['Approved source Shot', 'runtime-secret', 'controlSequence', 'failed attempts', 'local-structural-v1'],
};
const failures = [];
for (const [file, needles] of Object.entries(required)) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(`${file} missing ${needle}`);
}
const model = fs.readFileSync('src/domain/model.ts', 'utf8');
for (const contract of ['ai: aiProductionStateSchema', "'storyboard'", "'video'", "'ai'"]) if (!model.includes(contract)) failures.push(`model missing ${contract}`);
const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
if (!workflow.includes('audit:ai')) failures.push('CI missing Gate 5 AI audit');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!pkg.scripts?.['audit:ai']) failures.push('package.json missing audit:ai');
if (!String(pkg.scripts?.check ?? '').includes('audit:ai')) failures.push('check script does not include audit:ai');
if (failures.length) {
  console.error('PDS Gate 5 AI production smoke FAILED');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('PDS Gate 5 AI production smoke PASSED：Humanoid Rig 逐帧控制与哈希追溯已纳入 AI 控制包。');
