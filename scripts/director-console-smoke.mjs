import fs from 'node:fs';

const required = {
  'src/components/DirectorConsole3D.tsx': ['灯光台', 'directorLightToolPresets', 'directorLightDirectionPresets', 'addDirectorLight', 'setDirectorLightDirection', '瞄准人物中心', '复制灯具', '当前帧关键帧', 'data-camera-assistant', 'cameraDepthOfField', '对焦镜头目标', '对焦选中人物', '超焦距'],
  'src/components/SelectionInspector.tsx': ['data-selection-inspector', 'data-selection-kind', '主体属性 · 场面调度', '主体属性 · 摄影机', 'data-subject-properties="light"', '镜头级设置', '身高比例 IK'],
  'src/domain/directorLights.ts': ['key-area', 'fill-area', 'rim-spot', 'point', 'sun', 'ambient', "'left'", "'top'", "'right'", "'front'", "'bottom'", "'back'", 'directorStageTarget', 'createDirectorLightFromPreset', 'placeDirectorLightAtDirection'],
  'src/domain/poseIkLibrary.ts': ['poseHandIkHeightRatios', 'hands-on-hips', 'archery-draw', 'two-hand-hold', 'push-forward', 'carry-cradle'],
  'src/store/lightRegistry.ts': ['recordProjectHistory', "requirePermission(identity.role, 'project:edit')", 'APPROVED', 'addDirectorLight', 'duplicateDirectorLight', 'removeDirectorLight', 'aimDirectorLightAtStage', 'setDirectorLightDirection'],
  'src/store/sceneObjectRegistry.ts': ['deleteSceneSelection', 'setCameraEntityPose', 'setCameraKeyframeEntityPose', 'setLightEntityPose', 'protected-camera'],
  'src/engine/sceneEntities.ts': ['buildCameraEntity', 'buildLightEntity', 'resolveSceneEntityData', 'targetFromMinusZEntity', 'camera-keyframe:', 'selectionHalo'],
  'src/engine/directorGuides.ts': ['camera-frustum', 'camera-axis', 'actor-height', 'axis-180', 'look-lines', 'motion-paths', 'buildDirectorStructureGuides'],
  'src/engine/DirectorViewport.tsx': ['PointLight', 'SpotLight', 'RectAreaLight', 'DirectionalLight', 'HemisphereLight', 'environmentGroundColor', 'configureShadow', 'data-director-guide-toolbar', 'data-guide-toggle', '移动人物 W', "event.key === 'Delete'", 'setLightEntityPose', 'setCameraEntityPose', "setMode('rotate')"],
  'src/domain/poseLibrary.ts': ['archery-ready', 'archery-draw', 'archery-release', 'run-stride', 'deep-squat', 'jump-air', 'stand-up', 'posePresetIds'],
  'src/characters/rigRuntime.ts': ['poseHandIkHeightRatios', 'scaleRigPoint', "['leftHand', 'rightHand']", "['upperarm_l', 'lowerarm_l']"],
  'src/utils/math.ts': ['cameraDepthOfField', 'circleOfConfusionMm', 'hyperfocalM', 'focalLengthToHorizontalFovDeg', 'focalLengthToVerticalFovDeg'],
  'src/tests/directorLights.test.ts': ['所有快速灯具都满足工程 Light Schema', '轮廓光使用可投影聚光灯', '左上右前下后六个快速打光方向'],
  'src/tests/directorGuides.test.ts': ['提供导演常用的八类结构辅助', '摄影机视锥可以独立隐藏', '180 度轴'],
  'src/tests/lightingBalance.test.ts': ['中性棚拍使用低环境底光', '快速主光与补光保留明显照度比'],
  'src/tests/poseAnatomy.test.ts': ['叉腰使用双手 IK', '拉弓满弦把持弓手送到可达前方', '手腕仍保留独立 FK'],
  'src/tests/directorEntities.test.ts': ['至少三十组导演常用姿势', '摄影机实体及其子网格', '所有灯型都有实体器材', '旋转后的实体使用局部 -Z'],
  'src/tests/physicsIntegrity.test.ts': ['physically plausible depth of field', 'widens depth of field', 'cameraDepthOfField'],
  'src/director-console.css': ['director-light-dock', 'director-light-tools', 'director-selected-light', 'director-light-directions', 'director-camera-assistant', 'director-camera-focus-actions'],
  'src/director-guides.css': ['director-guide-toolbar', 'guide-spacer'],
  'src/selection-inspector.css': ['selection-inspector', 'selection-inspector-header'],
  'src/components/ProjectSidebar.tsx': ['3D 场景对象', 'selectedObjectId', 'shot.lights.map', 'shot.camera.path.map', '直接在中央 3D 视口点击'],
};

const failures = [];
for (const [file, tokens] of Object.entries(required)) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} missing ${token}`);
}

if (failures.length) {
  console.error('PDS 3D 导演台 / 主体属性 / 动作手位 / 灯光 / 辅助线审计失败');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log('PDS 3D 导演台审计通过：主体专属 Inspector、导演视图人物移动、八类结构辅助线/摄影机视锥隐藏、身高比例手部 IK、电影化灯光与环境层次、摄影助手、实体器材、审批只读和 Undo/Redo 合约均存在。');
