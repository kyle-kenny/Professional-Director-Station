import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeComfyBaseUrl, prepareComfyWorkflow, runComfyUiGeneration } from '../server/comfyui-provider.mjs';
import { renderStageControlMaps } from '../server/control-map-raster.mjs';

const workflow = {
  '3': { class_type: 'KSampler', inputs: { seed: 1 } },
  '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'old positive' } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative' } },
  '8': { class_type: 'PrimitiveStringMultiline', inputs: { text: '' } },
  '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'PDS' } },
  '11': { class_type: 'LoadImage', _meta: { title: 'PDS Pose' }, inputs: { image: '' } },
  '12': { class_type: 'LoadImage', _meta: { title: 'PDS Depth' }, inputs: { image: '' } },
  '13': { class_type: 'LoadImage', _meta: { title: 'PDS Lineart' }, inputs: { image: '' } },
};

const kp = (x, y) => ({ x, y, visible: true, cameraDepthM: 3 });
const controls = {
  schema: 'pds-ai-controls-1', shotId: 'shot-01', shotVersion: 1, frame: 12, fps: 24, frameAspect: 16 / 9,
  pose: [],
  pose2d: [{
    actorId: 'actor-1',
    keypoints: {
      nose: kp(.5, .18), neck: kp(.5, .28), rShoulder: kp(.56, .3), rElbow: kp(.61, .42), rWrist: kp(.63, .55),
      lShoulder: kp(.44, .3), lElbow: kp(.39, .42), lWrist: kp(.37, .55), rHip: kp(.54, .53), rKnee: kp(.55, .7), rAnkle: kp(.56, .9),
      lHip: kp(.46, .53), lKnee: kp(.45, .7), lAnkle: kp(.44, .9), rEye: kp(.515, .17), lEye: kp(.485, .17), rEar: kp(.53, .18), lEar: kp(.47, .18),
    },
  }],
  depth: [{ actorId: 'actor-1', cameraDepthM: 3, normalized: .25 }],
  lineart: [{ actorId: 'actor-1', head: { x: .5, y: .18, visible: true }, center: { x: .5, y: .5, visible: true }, feet: { x: .5, y: .9, visible: true } }],
  lights: [], cameraReference: { focalLengthMm: 50 },
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
      seedNodeId: '3', sizeNodeId: '5', controlNodeId: '8', outputNodeId: '9', poseImageNodeId: '11', depthImageNodeId: '12', lineartImageNodeId: '13',
      width: 1280, height: 720, visualTarget: 'composition', comfyPollMs: 100,
    },
  },
  prompt: 'PDS visual prompt', negativePrompt: 'no extra cast', promptHashSha256: 'b'.repeat(64),
  controls,
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
assert.equal(prepared.controlImageNodes.pose?.nodeId, '11');

const maps = renderStageControlMaps(controls, 320, 180);
for (const map of [maps.pose, maps.depth, maps.lineart]) {
  assert.deepEqual([...map.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(map.length > 100, 'control map should be a non-empty PNG');
}
assert.notDeepEqual(maps.pose, maps.depth);
assert.notDeepEqual(maps.depth, maps.lineart);

let historyReads = 0;
let uploadCount = 0;
const calls = [];
const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const fakeFetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method ?? 'GET', body: init.body });
  if (url.endsWith('/upload/image')) {
    uploadCount += 1;
    assert.ok(init.body instanceof FormData);
    return new Response(JSON.stringify({ name: `control-${uploadCount}.png`, subfolder: 'pds-control', type: 'input' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.endsWith('/prompt')) {
    const body = JSON.parse(String(init.body));
    assert.equal(body.prompt['6'].inputs.text, request.prompt);
    assert.equal(body.prompt['11'].inputs.image, 'pds-control/control-1.png');
    assert.equal(body.prompt['12'].inputs.image, 'pds-control/control-2.png');
    assert.equal(body.prompt['13'].inputs.image, 'pds-control/control-3.png');
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
assert.equal(result.controlMaps.length, 3);
assert.deepEqual(result.controlMaps.map((item) => item.kind), ['pose', 'depth', 'lineart']);
assert.ok(calls.filter((call) => call.url.endsWith('/upload/image')).length === 3);
assert.ok(calls.some((call) => call.url.includes('/view?filename=pds.png')));

for (const required of ['server/control-map-raster.mjs', 'server/comfyui-provider.mjs', 'server/comfyui-server.mjs', 'src/components/VisualStageWorkspace.tsx']) {
  assert.ok(fs.existsSync(required), `missing ${required}`);
}

console.log('PDS ComfyUI bridge smoke PASSED：Stage control-map raster, upload, workflow patching, queue polling and image return are deterministic.');
