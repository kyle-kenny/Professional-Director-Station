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
  poseImageNodeId?: string;
  depthImageNodeId?: string;
  lineartImageNodeId?: string;
  sceneDepthImageNodeId?: string;
  sceneNormalImageNodeId?: string;
  sceneMaskImageNodeId?: string;
  sceneEdgeImageNodeId?: string;
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

function isImageInputNode(node: ComfyApiWorkflowNode) {
  const title = nodeTitle(node);
  return title.includes('loadimage') || title.includes('load image') || 'image' in (node.inputs ?? {});
}

function findPdsImageNode(entries: Array<[string, ComfyApiWorkflowNode]>, kind: 'pose' | 'depth' | 'lineart'): string | undefined {
  return entries.find(([, node]) => {
    const title = nodeTitle(node);
    if (!isImageInputNode(node) || title.includes('pds scene')) return false;
    if (kind === 'pose') return title.includes('pds pose') || title.includes('pds_pose') || title.includes('pds-pose');
    if (kind === 'depth') return title.includes('pds depth') || title.includes('pds_depth') || title.includes('pds-depth');
    return title.includes('pds lineart') || title.includes('pds line art') || title.includes('pds_lineart') || title.includes('pds-lineart');
  })?.[0];
}

function findPdsSceneImageNode(entries: Array<[string, ComfyApiWorkflowNode]>, kind: 'depth' | 'normal' | 'mask' | 'edge'): string | undefined {
  return entries.find(([, node]) => {
    if (!isImageInputNode(node)) return false;
    const title = nodeTitle(node).replace(/[_-]+/g, ' ');
    return title.includes(`pds scene ${kind}`);
  })?.[0];
}

export function parseComfyApiWorkflowJson(text: string): ComfyApiWorkflow {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('ComfyUI workflow JSON 无法解析。请使用 Export Workflow (API) / Save (API Format) 导出的文件。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ComfyUI API workflow 必须是以 node id 为键的 JSON object。');
  const workflow = parsed as Record<string, unknown>;
  if (Array.isArray(workflow.nodes) || Array.isArray(workflow.links)) {
    throw new Error('这看起来是普通 ComfyUI workflow，而不是 API format workflow。请使用 Export Workflow (API) / Save (API Format)。');
  }
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
    poseImageNodeId: findPdsImageNode(entries, 'pose'),
    depthImageNodeId: findPdsImageNode(entries, 'depth'),
    lineartImageNodeId: findPdsImageNode(entries, 'lineart'),
    sceneDepthImageNodeId: findPdsSceneImageNode(entries, 'depth'),
    sceneNormalImageNodeId: findPdsSceneImageNode(entries, 'normal'),
    sceneMaskImageNodeId: findPdsSceneImageNode(entries, 'mask'),
    sceneEdgeImageNodeId: findPdsSceneImageNode(entries, 'edge'),
  };
}

export function inspectComfyWorkflowJson(text: string): { workflow: ComfyApiWorkflow; canonicalJson: string; hints: ComfyWorkflowNodeHints } {
  const workflow = parseComfyApiWorkflowJson(text);
  return { workflow, canonicalJson: JSON.stringify(workflow), hints: detectComfyWorkflowNodeHints(workflow) };
}
