import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeComfyBaseUrl, prepareComfyWorkflow, runComfyUiGeneration } from '../server/comfyui-provider.mjs';

const workflow = {
  '3': { class_type: 'KSampler', inputs: { seed: 1 } },
  '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'old positive' } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative' } },
  '8': { class_type: 'PrimitiveStringMultiline', inputs: { text: '' } },
  '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'PDS' } },
};

const request = {
  schema: 'pds-ai-generation-1',
  task: 'storyboard',
  projectId: 'project-demo',
  source: { shotId: 'shot-01', shotVersion: 1, shotHashSha256: 'a'.repeat(64), frame: 12, fps: 24 },
  profile: {
    id: 'comfy-flux', label: 'Comfy Flux', provider: 'pds-http', modelId: 'flux-dev', revision: '1',
    parameters: {
      comfyBaseUrl: 'http://127.0.0.1:8188', workflowJson: JSON.stringify(workflow), positiveNodeId: '6', negativeNodeId: '7',
      seedNodeId: '3', sizeNodeId: '5', controlNodeId: '8', outputNodeId: '9', width: 1280, height: 720, visualTarget: 'composition', comfyPollMs: 100,
    },
  },
  prompt: 'PDS visual prompt', negativePrompt: 'no extra cast', promptHashSha256: 'b'.repeat(64),
  controls: { schema: 'pds-ai-controls-1', frame: 12, pose: [], depth: [], lineart: [], lights: [], cameraReference: { focalLengthMm: 50 } },
  controlHashSha256: 'c'.repeat(64),
};

assert.equal(normalizeComfyBaseUrl('http://localhost:8188/'), 'http://localhost:8188');
assert.throws(() => normalizeComfyBaseUrl('http://example.com:8188'), /private-network/);
assert.equal(normalizeComfyBaseUrl('https://comfy.example.com', { allowRemote: true }), 'https://comfy.example.com');

const prepared = prepareComfyWorkflow(request);
assert.equal(prepared.workflow['6'].inputs.text, request.prompt);
assert.equal(prepared.workflow['7'].inputs.text, request.negativePrompt);
assert.equal(prepared.workflow['5'].inputs.width, 1280);
assert.equal(prepared.workflow['5'].inputs.height, 720);
assert.equal(prepared.workflow['3'].inputs.seed, prepared.seed);
assert.match(prepared.workflow['8'].inputs.text, /"shotId":"shot-01"/);
assert.match(prepared.workflow['8'].inputs.text, /"visualTarget":"composition"/);

let historyReads = 0;
const calls = [];
const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const fakeFetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method ?? 'GET', body: init.body });
  if (url.endsWith('/prompt')) {
    const body = JSON.parse(String(init.body));
    assert.equal(body.prompt['6'].inputs.text, request.prompt);
    return new Response(JSON.stringify({ prompt_id: 'prompt-pds-1', number: 1, node_errors: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/history/prompt-pds-1')) {
    historyReads += 1;
    const payload = historyReads === 1 ? {} : {
      'prompt-pds-1': { status: { completed: true, status_str: 'success' }, outputs: { '9': { images: [{ filename: 'pds.png', subfolder: 'pds', type: 'output' }] } } },
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('/view?')) return new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } });
  throw new Error(`Unexpected fetch ${url}`);
};

const result = await runComfyUiGeneration(request, { fetchImpl: fakeFetch });
assert.equal(result.jobId, 'prompt-pds-1');
assert.equal(result.mimeType, 'image/png');
assert.deepEqual(Buffer.from(result.mediaBase64, 'base64'), Buffer.from(pngBytes));
assert.equal(result.seed, prepared.seed);
assert.ok(calls.some((call) => call.url.includes('/view?filename=pds.png')));

for (const required of ['server/comfyui-provider.mjs', 'server/comfyui-server.mjs', 'src/components/VisualStageWorkspace.tsx']) {
  assert.ok(fs.existsSync(required), `missing ${required}`);
}

console.log('PDS ComfyUI bridge smoke PASSED：workflow patching, queue polling and image return are deterministic.');
