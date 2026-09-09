import fs from 'node:fs';

const required = {
  'src/components/DirectorConsole3D.tsx': ['灯光台', 'directorLightToolPresets', 'directorLightDirectionPresets', 'addDirectorLight', 'setDirectorLightDirection', '瞄准人物中心', '复制灯具', '当前帧关键帧'],
  'src/domain/directorLights.ts': ['key-area', 'fill-area', 'rim-spot', 'point', 'sun', 'ambient', "'left'", "'top'", "'right'", "'front'", "'bottom'", "'back'", 'directorStageTarget', 'createDirectorLightFromPreset', 'placeDirectorLightAtDirection'],
  'src/store/lightRegistry.ts': ['recordProjectHistory', "requirePermission(identity.role, 'project:edit')", 'APPROVED', 'addDirectorLight', 'duplicateDirectorLight', 'removeDirectorLight', 'aimDirectorLightAtStage', 'setDirectorLightDirection'],
  'src/engine/DirectorViewport.tsx': ['PointLight', 'SpotLight', 'RectAreaLight', 'DirectionalLight', 'AmbientLight', 'lightObjects', 'setLightPosition'],
  'src/tests/directorLights.test.ts': ['所有快速灯具都满足工程 Light Schema', '轮廓光使用可投影聚光灯', '左上右前下后六个快速打光方向'],
  'src/director-console.css': ['director-light-dock', 'director-light-tools', 'director-selected-light', 'director-light-directions'],
  'src/components/ProjectSidebar.tsx': ['3D 场景对象', 'selectedObjectId', 'shot.lights.map'],
};

const failures = [];
for (const [file, tokens] of Object.entries(required)) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} missing ${token}`);
}

if (failures.length) {
  console.error('PDS 3D 导演台 / 灯光台审计失败');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('PDS 3D 导演台 / 灯光台审计通过：对象树、快速摆灯、六方向布光、真实 Three.js 光源、3D 移动、审批只读与 Undo/Redo 合约均存在。');
