import { randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_POLL_MS = 600;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function isLocalOrPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1' || host.startsWith('fc') || host.startsWith('fd') || isPrivateIpv4(host);
}

export function normalizeComfyBaseUrl(value, { allowRemote = false } = {}) {
  let url;
  try { url = new URL(String(value ?? '').trim()); }
  catch { throw new Error('ComfyUI base URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ComfyUI base URL must use HTTP or HTTPS.');
  const local = isLocalOrPrivateHost(url.hostname);
  if (!local && !(allowRemote && url.protocol === 'https:')) {
    throw new Error('ComfyUI bridge only allows localhost/private-network targets by default; remote targets require HTTPS and PDS_ALLOW_REMOTE_COMFYUI=1.');
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function requiredNode(workflow, nodeId, label) {
  const id = String(nodeId ?? '').trim();
  if (!id) throw new Error(`${label} node id is required.`);
  const node = workflow[id];
  if (!node || typeof node !== 'object' || !node.inputs || typeof node.inputs !== 'object') throw new Error(`${label} node ${id} was not found in the ComfyUI API workflow.`);
  return node;
}

function optionalNode(workflow, nodeId, label) {
  const id = String(nodeId ?? '').trim();
  return id ? requiredNode(workflow, id, label) : undefined;
}

function intParam(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function boundedInt(value, fallback, min, max) {
  return Math.min(max, Math.max(min, intParam(value, fallback)));
}

function workflowFromParameters(parameters) {
  const source = parameters?.workflowJson;
  if (typeof source !== 'string' || !source.trim()) throw new Error('ComfyUI provider is missing workflowJson. Export the workflow in API format and register it in PDS.');
  let parsed;
  try { parsed = JSON.parse(source); }
  catch { throw new Error('ComfyUI workflowJson is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ComfyUI API workflow must be a JSON object keyed by node id.');
  return structuredClone(parsed);
}

export function prepareComfyWorkflow(request, { allowRemote = false } = {}) {
  if (!request || request.schema !== 'pds-ai-generation-1' || request.task !== 'storyboard') throw new Error('ComfyUI bridge only accepts PDS storyboard generation requests.');
  const parameters = request.profile?.parameters ?? {};
  const baseUrl = normalizeComfyBaseUrl(parameters.comfyBaseUrl, { allowRemote });
  const workflow = workflowFromParameters(parameters);
  const positive = requiredNode(workflow, parameters.positiveNodeId, 'Positive prompt');
  const positiveInput = String(parameters.positiveInputName || 'text');
  positive.inputs[positiveInput] = request.prompt;

  const negative = optionalNode(workflow, parameters.negativeNodeId, 'Negative prompt');
  if (negative) negative.inputs[String(parameters.negativeInputName || 'text')] = request.negativePrompt ?? '';

  const seed = boundedInt(parameters.seed, Number.parseInt(String(request.controlHashSha256 || '1').slice(0, 8), 16) || 1, 0, 0x7fffffff);
  const seedNode = optionalNode(workflow, parameters.seedNodeId, 'Seed');
  if (seedNode) seedNode.inputs[String(parameters.seedInputName || 'seed')] = seed;

  const width = boundedInt(parameters.width, 1280, 64, 8192);
  const height = boundedInt(parameters.height, 720, 64, 8192);
  const sizeNode = optionalNode(workflow, parameters.sizeNodeId, 'Latent size');
  if (sizeNode) {
    sizeNode.inputs[String(parameters.widthInputName || 'width')] = width;
    sizeNode.inputs[String(parameters.heightInputName || 'height')] = height;
  }

  const controlNode = optionalNode(workflow, parameters.controlNodeId, 'PDS control JSON');
  if (controlNode) {
    controlNode.inputs[String(parameters.controlInputName || 'text')] = JSON.stringify({
      source: request.source,
      controls: request.controls,
      visualTarget: parameters.visualTarget,
    });
  }

  return {
    baseUrl,
    workflow,
    outputNodeId: String(parameters.outputNodeId ?? '').trim() || undefined,
    seed,
    width,
    height,
    timeoutMs: boundedInt(parameters.comfyTimeoutMs, DEFAULT_TIMEOUT_MS, 5_000, 550_000),
    pollMs: boundedInt(parameters.comfyPollMs, DEFAULT_POLL_MS, 100, 5_000),
  };
}

function findOutputImage(historyRecord, outputNodeId) {
  const outputs = historyRecord?.outputs;
  if (!outputs || typeof outputs !== 'object') return undefined;
  const entries = outputNodeId && outputs[outputNodeId] ? [[outputNodeId, outputs[outputNodeId]]] : Object.entries(outputs);
  for (const [, output] of entries) {
    const image = Array.isArray(output?.images) ? output.images[0] : undefined;
    if (image?.filename) return image;
  }
  return undefined;
}

async function readJsonResponse(response, label) {
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${payload?.error ?? payload?.message ?? 'unknown error'}`);
  return payload;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runComfyUiGeneration(request, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const prepared = prepareComfyWorkflow(request, { allowRemote: options.allowRemote ?? false });
  const clientId = `pds-${randomUUID()}`;
  const submitResponse = await fetchImpl(`${prepared.baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: prepared.workflow, client_id: clientId }),
    signal: options.signal,
  });
  const submitted = await readJsonResponse(submitResponse, 'ComfyUI /prompt');
  const promptId = String(submitted.prompt_id ?? '').trim();
  if (!promptId) throw new Error(`ComfyUI did not return prompt_id${submitted.node_errors ? `; node errors: ${JSON.stringify(submitted.node_errors)}` : ''}.`);

  const deadline = Date.now() + prepared.timeoutMs;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error('ComfyUI generation was aborted.');
    const historyResponse = await fetchImpl(`${prepared.baseUrl}/history/${encodeURIComponent(promptId)}`, { signal: options.signal });
    const history = await readJsonResponse(historyResponse, 'ComfyUI /history');
    const record = history?.[promptId] ?? (history?.outputs ? history : undefined);
    if (record?.status?.status_str === 'error') throw new Error(`ComfyUI job ${promptId} failed.`);
    const image = findOutputImage(record, prepared.outputNodeId);
    if (image) {
      const viewUrl = new URL(`${prepared.baseUrl}/view`);
      viewUrl.searchParams.set('filename', String(image.filename));
      if (image.subfolder) viewUrl.searchParams.set('subfolder', String(image.subfolder));
      viewUrl.searchParams.set('type', String(image.type || 'output'));
      const mediaResponse = await fetchImpl(viewUrl, { signal: options.signal });
      if (!mediaResponse.ok) throw new Error(`ComfyUI /view failed with HTTP ${mediaResponse.status}.`);
      const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
      if (!bytes.length) throw new Error('ComfyUI returned an empty image.');
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error('ComfyUI image exceeds the 64 MiB bridge safety limit.');
      return {
        mediaBase64: Buffer.from(bytes).toString('base64'),
        mimeType: mediaResponse.headers.get('content-type') || 'image/png',
        jobId: promptId,
        seed: prepared.seed,
      };
    }
    if (record?.status?.completed === true) throw new Error(`ComfyUI job ${promptId} completed without an image output.`);
    await sleep(prepared.pollMs);
  }
  throw new Error(`ComfyUI job ${promptId} timed out after ${prepared.timeoutMs} ms.`);
}
