import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { runComfyUiGeneration } from './comfyui-provider.mjs';

const PORT = Number(process.env.PDS_COMFYUI_BRIDGE_PORT ?? 8790);
const HOST = process.env.PDS_COMFYUI_BRIDGE_HOST ?? '127.0.0.1';
const BRIDGE_TOKEN = process.env.PDS_COMFYUI_BRIDGE_TOKEN ?? '';
const ALLOW_REMOTE_COMFYUI = process.env.PDS_ALLOW_REMOTE_COMFYUI === '1';
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

if (!loopbackHosts.has(HOST) && !BRIDGE_TOKEN) {
  throw new Error('Refusing to expose the ComfyUI bridge on a non-loopback host without PDS_COMFYUI_BRIDGE_TOKEN.');
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch { return false; }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
  res.setHeader('cache-control', 'no-store');
}

function authorized(req) {
  if (!BRIDGE_TOKEN) return true;
  return req.headers.authorization === `Bearer ${BRIDGE_TOKEN}`;
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('PDS ComfyUI bridge request exceeds the 8 MiB safety limit.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('PDS ComfyUI bridge received invalid JSON.'); }
}

export function createComfyUiBridgeServer() {
  return http.createServer(async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(isAllowedOrigin(req.headers.origin) ? 204 : 403);
      res.end();
      return;
    }
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, provider: 'comfyui', allowRemoteComfyUi: ALLOW_REMOTE_COMFYUI }));
      return;
    }
    if (req.url !== '/v1/generate' || req.method !== 'POST') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not-found' }));
      return;
    }
    if (!isAllowedOrigin(req.headers.origin)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'origin-not-allowed' }));
      return;
    }
    if (!authorized(req)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bridge-authorization-required' }));
      return;
    }
    try {
      const request = await readJsonBody(req);
      const output = await runComfyUiGeneration(request, { allowRemote: ALLOW_REMOTE_COMFYUI });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(output));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'ComfyUI bridge failure');
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createComfyUiBridgeServer();
  server.listen(PORT, HOST, () => console.log(`PDS ComfyUI bridge listening on http://${HOST}:${PORT}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
