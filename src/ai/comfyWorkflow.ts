export type ComfyApiWorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ComfyApiWorkflow = Record<string, ComfyApiWorkflowNode>;

export type ComfyWorkflowNodeHints = {
  positiveNodeId?: string;
  negativeNodeId?: string;
  seedNodeId?: string;
  sizeNodeId?: string;
  outputNodeId?: string;
  controlNodeId?: string;
};

function linkedNodeId(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length < 1) return undefined;
  const id = value[0];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
}

function hasNumericSize(node: ComfyApiWorkflowNode): boolean {
  return typeof node.inputs?.width === 'number' && typeof node.inputs?.height === 'number';
}

function nodeTitle(node: ComfyApiWorkflowNode): string {
  return `${node.class_type ?? ''} ${node._meta?.title ?? ''}`.toLowerCase();
}

export function parseComfyApiWorkflowJson(text: string): ComfyApiWorkflow {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('ComfyUI workflow JSON 无法解析。请使用 Export Workflow (API) / Save (API Format) 导出的文件。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ComfyUI API workflow 必须是以 node id 为键的 JSON object。');
  const workflow = parsed as Record<string, unknown>;
  for (const [id, raw] of Object.entries(workflow)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`ComfyUI node ${id} 不是合法对象。`);
    const node = raw as ComfyApiWorkflowNode;
    if (!node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) throw new Error(`ComfyUI node ${id} 缺少 inputs。`);
    if (typeof node.class_type !== 'string' || !node.class_type) throw new Error(`ComfyUI node ${id} 缺少 class_type；这看起来不是 API format workflow。`);
  }
  return workflow as ComfyApiWorkflow;
}

export function detectComfyWorkflowNodeHints(workflow: ComfyApiWorkflow): ComfyWorkflowNodeHints {
  const entries = Object.entries(workflow);
  const samplerEntry = entries.find(([, node]) => {
    const title = nodeTitle(node);
    return title.includes('ksampler') || ('seed' in (node.inputs ?? {}) && ('positive' in (node.inputs ?? {}) || 'negative' in (node.inputs ?? {})));
  });
  const samplerId = samplerEntry?.[0];
  const sampler = samplerEntry?.[1];
  const positiveNodeId = linkedNodeId(sampler?.inputs?.positive);
  const negativeNodeId = linkedNodeId(sampler?.inputs?.negative);
  const latentNodeId = linkedNodeId(sampler?.inputs?.latent_image);

  const sizeNodeId = latentNodeId && workflow[latentNodeId] && hasNumericSize(workflow[latentNodeId])
    ? latentNodeId
    : entries.find(([, node]) => hasNumericSize(node))?.[0];
  const outputNodeId = entries.find(([, node]) => {
    const title = nodeTitle(node);
    return title.includes('saveimage') || title.includes('save image') || title.includes('previewimage') || title.includes('preview image');
  })?.[0];
  const controlNodeId = entries.find(([, node]) => {
    const title = nodeTitle(node);
    return title.includes('pds control') || title.includes('pds_control') || title.includes('pdscontrol');
  })?.[0];

  return {
    positiveNodeId,
    negativeNodeId,
    seedNodeId: samplerId,
    sizeNodeId,
    outputNodeId,
    controlNodeId,
  };
}

export function inspectComfyWorkflowJson(text: string): { workflow: ComfyApiWorkflow; canonicalJson: string; hints: ComfyWorkflowNodeHints } {
  const workflow = parseComfyApiWorkflowJson(text);
  return { workflow, canonicalJson: JSON.stringify(workflow), hints: detectComfyWorkflowNodeHints(workflow) };
}
