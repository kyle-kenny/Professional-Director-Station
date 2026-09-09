# 正式角色资产、骨骼调姿与许可证

PDS 1.1 起，3D 导演台默认人物不再使用程序生成的人体几何体，而使用外部开源 Humanoid 角色资产，并提供完整导演级 FK / IK 调姿层。

## 默认角色包

- 名称：Quaternius — Universal Base Characters
- 作者：Quaternius
- 官方来源：https://quaternius.com/packs/universalbasecharacters.html
- 许可证：CC0 1.0 Universal
- 官方说明：可用于个人、教育和商业项目；提供 glTF / FBX；模型使用 Humanoid Rig，面向动画重定向。
- PDS 使用：Teen Male/Female、Regular Male/Female；Superhero Male/Female 同步安装，作为体型扩展基础。

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

## Humanoid 骨骼控制

PDS 1.1 对外暴露导演友好的中文控制名，对内映射 Quaternius Humanoid 骨骼。当前可编辑骨骼包括：

- 躯干：骨盆、腰椎、胸椎、上胸
- 头颈：颈部、头部
- 左右手臂：锁骨、上臂、前臂/肘、手腕
- 左右腿：大腿/髋、小腿/膝、脚踝

每个 FK 关节有保守的导演安全旋转范围。其目的不是替代医学级人体动力学，而是阻止预演阶段最常见的反折、膝肘错误方向和过度扭转。

## FK / IK

### FK

用户可以在 Inspector 中通过角度滑杆/数值输入调整单关节，也可以进入“人物调姿”模式，直接在 3D 中选中蓝色关节控制点并使用局部旋转 Gizmo。

### IK

四条肢体链提供两段式 IK：

- 左手：`upperarm_l → lowerarm_l → hand_l`
- 右手：`upperarm_r → lowerarm_r → hand_r`
- 左脚：`thigh_l → calf_l → foot_l`
- 右脚：`thigh_r → calf_r → foot_r`

手/脚目标使用绿色控制点；肘/膝弯曲方向使用橙色 Pole 控制点。目标超过肢体长度时，求解器会夹到最大可达距离，不允许把骨骼链拉长。

IK 目标可锁定。锁定后不能误拖该目标；解锁后才能继续编辑。

## 头部注视

黄色“头部注视”目标驱动颈部朝向，俯仰和左右转头被限制在导演安全范围。它用于构图/表演方向预演，不宣称是眼球级视线追踪或面部捕捉系统。

## 姿势动画

人物整体运动与骨骼姿势是两条独立时间轨：

- `Actor.path`：人物根节点位置/旋转运动
- `Actor.posePath`：FK / IK / Look At 姿势状态

姿势轨建立首个关键帧后，FK / IK / Look At 编辑自动写当前整帧。帧间 FK 使用最短角插值，IK/Pole/Look At 使用空间插值。时间线可跳转、添加和删除姿势关键帧。

## 自定义姿势与镜像

- 当前完整 Rig 可以保存为工程级自定义姿势。
- 自定义姿势可以应用到其他兼容 Humanoid 角色。
- “左右镜像”会交换左右手臂/腿的 FK 与 IK，并镜像控制目标。
- 所有姿势编辑进入现有工程 Undo / Redo 历史。
- Approved Shot 保持只读，调姿不能绕过 Review/Approval 不可变性。

## AI 控制一致性

AI Production 的逐帧 Control Bundle 现在包含每个演员的完整 `humanoidRig` 和独立 `rigHashSha256`。因此导演在 PDS 中摆出的手脚、脊柱和头部方向会成为 Storyboard/Video 请求的可追溯结构输入，而不是只保存一个抽象姿势名称。

## 运行时性能

模型模板被缓存，SkinnedMesh 实例使用 `SkeletonUtils.clone` 安全克隆。时间线播放只更新人物根变换、骨骼矩阵、灯光和摄影机；不会逐帧重新下载或重建角色模型。

## 许可证边界

CC0 不要求署名，但 PDS 仍保留作者、官方来源、镜像 commit 和文件哈希，目的是满足制作管线的 provenance / audit 要求。第三方模型的商标、肖像或其他独立权利仍应由实际制作项目按使用场景自行审查。
