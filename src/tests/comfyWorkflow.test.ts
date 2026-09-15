import { describe, expect, it } from 'vitest';
import { detectComfyWorkflowNodeHints, inspectComfyWorkflowJson, parseComfyApiWorkflowJson } from '../ai/comfyWorkflow';

describe('PDS 1.8 ComfyUI workflow inspection', () => {
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
    '14': { class_type: 'LoadImage', _meta: { title: 'PDS Scene Depth' }, inputs: { image: '' } },
    '15': { class_type: 'LoadImage', _meta: { title: 'PDS Scene Normal' }, inputs: { image: '' } },
    '16': { class_type: 'LoadImage', _meta: { title: 'PDS Scene Mask' }, inputs: { image: '' } },
    '17': { class_type: 'LoadImage', _meta: { title: 'PDS Scene Edge' }, inputs: { image: '' } },
  };

  it('detects common KSampler, structural control and full Stage render-pass nodes', () => {
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
      sceneDepthImageNodeId: '14',
      sceneNormalImageNodeId: '15',
      sceneMaskImageNodeId: '16',
      sceneEdgeImageNodeId: '17',
    });
  });

  it('canonicalizes an API-format workflow and rejects normal UI workflow shapes', () => {
    const inspected = inspectComfyWorkflowJson(JSON.stringify(workflow, null, 2));
    expect(inspected.canonicalJson).toBe(JSON.stringify(workflow));
    expect(inspected.hints.positiveNodeId).toBe('6');
    expect(inspected.hints.poseImageNodeId).toBe('11');
    expect(inspected.hints.sceneEdgeImageNodeId).toBe('17');
    expect(() => parseComfyApiWorkflowJson(JSON.stringify({ nodes: [], links: [] }))).toThrow(/API format workflow/);
  });
});
