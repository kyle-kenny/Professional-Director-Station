import { describe, expect, it } from 'vitest';
import { detectComfyWorkflowNodeHints, inspectComfyWorkflowJson, parseComfyApiWorkflowJson } from '../ai/comfyWorkflow';

describe('PDS 1.7 ComfyUI workflow inspection', () => {
  const workflow = {
    '3': { class_type: 'KSampler', inputs: { seed: 1, positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 1280, height: 720, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'positive' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'negative' } },
    '8': { class_type: 'PrimitiveStringMultiline', _meta: { title: 'PDS Control JSON' }, inputs: { text: '' } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'PDS', images: ['10', 0] } },
    '10': { class_type: 'VAEDecode', inputs: { samples: ['3', 0] } },
    '11': { class_type: 'LoadImage', _meta: { title: 'PDS Pose' }, inputs: { image: '' } },
    '12': { class_type: 'LoadImage', _meta: { title: 'PDS Depth' }, inputs: { image: '' } },
    '13': { class_type: 'LoadImage', _meta: { title: 'PDS Lineart' }, inputs: { image: '' } },
  };

  it('detects common KSampler prompt, seed, size, control image and output nodes', () => {
    expect(detectComfyWorkflowNodeHints(workflow)).toEqual({
      positiveNodeId: '6',
      negativeNodeId: '7',
      seedNodeId: '3',
      sizeNodeId: '5',
      outputNodeId: '9',
      controlNodeId: '8',
      poseImageNodeId: '11',
      depthImageNodeId: '12',
      lineartImageNodeId: '13',
    });
  });

  it('canonicalizes an API-format workflow and rejects normal UI workflow shapes', () => {
    const inspected = inspectComfyWorkflowJson(JSON.stringify(workflow, null, 2));
    expect(inspected.canonicalJson).toBe(JSON.stringify(workflow));
    expect(inspected.hints.positiveNodeId).toBe('6');
    expect(inspected.hints.poseImageNodeId).toBe('11');
    expect(() => parseComfyApiWorkflowJson(JSON.stringify({ nodes: [], links: [] }))).toThrow(/API format workflow/);
  });
});
