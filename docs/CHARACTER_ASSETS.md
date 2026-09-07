# 正式角色资产与许可证

PDS 1.1 起，3D 导演台默认人物不再使用程序生成的人体几何体，而使用外部开源 Humanoid 角色资产。

## 默认角色包

- 名称：Quaternius — Universal Base Characters
- 作者：Quaternius
- 官方来源：https://quaternius.com/packs/universalbasecharacters.html
- 许可证：CC0 1.0 Universal
- 官方说明：可用于个人、教育和商业项目；提供 glTF / FBX；模型使用 Humanoid Rig，面向动画重定向。
- PDS 使用：Teen Male/Female、Regular Male/Female；Superhero Male/Female 同步安装，作为后续体型扩展基础。

## 可复现安装

仓库不把几十 MB 的第三方二进制和贴图直接混进 Git 历史。`scripts/install-character-assets.mjs` 在 `npm run dev` / `npm run build` 前将角色包安装到：

`public/assets/vendor/quaternius/universal-base-characters/`

安装器锁定公共镜像 commit `6f12ffb2f924af86d910ade13e6e2ba3df8cd3df`。六个核心 `.gltf` / `.bin` 和所有被 glTF 引用的贴图都按锁定 Git Blob SHA-1 验证；安装完成后还会生成包含每个文件 SHA-256、大小、来源和许可证的 `manifest.json`。

运行中的 PDS 只读取本地构建产物，不从第三方站点动态加载人物。

## 年龄映射

当前开源包原生提供 Teen / Regular / Superhero 三类男女体型：

- 儿童：Teen 网格，按演员 `heightM` 等比缩放；保持外部网格拓扑，不自行建模。
- 青少年：Teen 网格。
- 成年：Regular 网格。
- 老年：Regular 网格 + 骨骼体态调整 + 灰发材质处理；保持外部网格拓扑。

年龄标签、眼高、真实身高、站位、姿势和演员运动仍由 PDS Shot 数据控制。

## 骨骼映射

PDS 导演姿势映射到 Quaternius Humanoid 骨骼：

- 躯干 → `spine_02`
- 头颈 → `neck_01`
- 左/右臂 → `upperarm_l` / `upperarm_r`
- 左/右腿 → `thigh_l` / `thigh_r`

模型模板被缓存，SkinnedMesh 实例使用 `SkeletonUtils.clone` 安全克隆；时间线播放只更新演员根变换、灯光和摄影机，不逐帧重新下载或重建人物模型。

## 许可证边界

CC0 不要求署名，但 PDS 仍保留作者、官方来源、镜像 commit 和文件哈希，目的是满足制作管线的 provenance / audit 要求。第三方模型的商标、肖像或其他独立权利仍应由实际制作项目按使用场景自行审查。
