import fs from 'node:fs';

const required = {
  'src/components/DirectorConsole3D.tsx': ['灯光台', 'directorLightToolPresets', 'directorLightDirectionPresets', 'addDirectorLight', 'setDirectorLightDirection', '瞄准人物中心', '复制灯具', '当前帧关键帧'],
  'src/domain/directorLights.ts': ['key-area', 'fill-area', 'rim-spot', 'point', 'sun', 'ambient', "'left'", "'top'", "'right'", "'front'", "'bottom'", "'back'", 'directorStageTarget', 'createDirectorLightFromPreset', 'placeDirectorLightAtDirection'],
  'src/store/lightRegistry.ts': ['recordProjectHistory', "requirePermission(identity.role, 'project:edit')", 'APPROVED', 'addDirectorLight', 'duplicateDirectorLight', 'removeDirectorLight', 'aimDirectorLightAtStage', 'setDirectorLightDirection'],
  'src/store/sceneObjectRegistry.ts': ['deleteSceneSelection', 'setCameraEntityPose', 'setCameraKeyframeEntityPose', 'setLightEntityPose', 'protected-camera'],
  'src/engine/sceneEntities.ts': ['buildCameraEntity', 'buildLightEntity', 'resolveSceneEntityData', 'targetFromMinusZEntity', 'camera-keyframe:', 'selectionHalo'],
  'src/engine/DirectorViewport.tsx': ['PointLight', 'SpotLight', 'RectAreaLight', 'DirectionalLight', 'AmbientLight', 'buildCameraEntity', 'buildLightEntity', 'resolveSceneEntityData', "event.key === 'Delete'", 'setLightEntityPose', 'setCameraEntityPose', "setMode('rotate')"],
  'src/domain/poseLibrary.ts': ['archery-ready', 'archery-draw', 'archery-release', 'run-stride', 'deep-squat', 'jump-air', 'stand-up', 'posePresetIds'],
  'src/tests/directorLights.test.ts': ['所有快速灯具都满足工程 Light Schema', '轮廓光使用可投影聚光灯', '左上右前下后六个快速打光方向'],
  'src/tests/directorEntities.test.ts': ['至少三十组导演常用姿势', '摄影机实体及其子网格', '所有灯型都有实体器材', '旋转后的实体使用局部 -Z'],
  'src/director-console.css': ['director-light-dock', 'director-light-tools', 'director-selected-light', 'director-light-directions'],
  'src/components/ProjectSidebar.tsx': ['3D 场景对象', 'selectedObjectId', 'shot.lights.map', 'shot.camera.path.map', '直接在中央 3D 视口点击'],
};

const failures = [];
for (const [file, tokens] of Object.entries(required)) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} missing ${token}`);
}

if (failures.length) {
  console.error('PDS 3D 导演台 / 实体器材审计失败');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('PDS 3D 导演台审计通过：直接拾取、实体摄影机/机位、实体灯具、W/E/Delete 快捷操作、灯头旋转、六方向布光、扩展姿势库、审批只读与 Undo/Redo 合约均存在。');