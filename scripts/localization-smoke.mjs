import fs from 'node:fs/promises';

const files = [
  'src/components/TopBar.tsx',
  'src/components/ProjectSidebar.tsx',
  'src/components/Inspector.tsx',
  'src/components/TimelinePanel.tsx',
  'src/components/AssetLibraryPanel.tsx',
  'src/components/CollaborationPanel.tsx',
  'src/components/ReviewWorkspace.tsx',
  'src/components/PipelineWorkspace.tsx',
  'src/components/AIWorkspace.tsx',
  'src/components/PoseEditorPanel.tsx',
  'src/engine/DirectorViewport.tsx',
];

const bannedVisiblePhrases = [
  'Professional Director Station', 'Digital Director Workspace',
  'Asset Registry', 'AI Production', 'PIPELINE INTEROPERABILITY',
  'AUTHENTICATED COLLABORATION', 'FRAME REVIEW', 'FRAME COMMENTS',
  'IMMUTABLE VERSIONS', 'PROJECT MEMBERS', 'APPROVAL AUDIT',
  'Freeze immutable version', 'Rollback → new WIP',
  'Export OTIO', 'Import OTIO', 'Export MP4 Reference',
  'FRAME MARKERS / NOTES', 'WAVEFORM AUDIO', 'CAM RIGS',
  '+ Camera Key', '+ Actor Key', '+ Light Key', '+ Import Audio',
  'Remove Clip', 'No media', 'Connect</button>', 'Disconnect</button>',
  '>Point</button>', '>Box</button>', 'Add / Update member',
  'OPENUSD SCENE COMPOSITION', 'PROJECT COLOR', 'LOOK REFERENCES',
  'STORAGE / MEDIA PROXY POLICY', 'SCRIPT BREAKDOWN', 'STRUCTURE ANALYSIS',
  'MODEL PROFILE / GENERATION', 'GENERATED MEDIA / APPROVAL',
];

const texts = await Promise.all(files.map(async (file) => [file, await fs.readFile(file, 'utf8')]));
for (const [file, text] of texts) {
  if (!/[\u3400-\u9fff]/.test(text)) throw new Error(`${file} 没有中文可见文案。`);
  for (const phrase of bannedVisiblePhrases) {
    if (text.includes(phrase)) throw new Error(`${file} 仍残留未汉化可见文案：${phrase}`);
  }
}

const allowedStandards = ['USD', 'USDA', 'OTIO', 'OCIO', 'ACES', 'MaterialX', 'GLB', 'FBX', 'SHA-256', 'MP4', 'IK', 'FK', 'Pole', 'PDS', 'WebGL', 'IndexedDB', 'CC0'];
console.log(`PDS 中文界面审计通过：${files.length} 个核心工作区无已知英文界面残留；行业标准缩写保留：${allowedStandards.join(', ')}。`);
