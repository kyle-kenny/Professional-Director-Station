# Professional Director Station (PDS)

面向导演教学、影视前期制作、多人 Review、Pipeline 交换与可追溯 AI 影视生产的数字导演工作台。

## PDS 1.1.1 能力

- **3D 导演台**：正式 CC0 Humanoid 角色、真实米制坐标、FK/IK 调姿、35 组基础导演姿势、Transform Gizmo、人物/摄影机/灯光关键帧、焦段/机位预设、曝光与阴影。
- **片场器材实体化**：主摄影机、摄影机动画机位、区域灯、聚光灯、平行光、点光、环境光都有独立 3D 实体；中央视口直接点击即可选择，不依赖左侧对象树。
- **导演快捷操作**：W 移动、E 旋转、R 人物整体缩放、Delete 删除当前人物/灯具/机位；主摄影机受工程 Schema 保护，避免误删。定向灯旋转后实时更新照射方向，并保留一键瞄准与六方向快速布光。
- **正式开源人物**：Quaternius Universal Base Characters（CC0 1.0）作为默认 SkinnedMesh/Humanoid 角色源，安装时锁定上游 commit、校验 Git Blob，并生成 SHA-256 provenance；儿童/青少年/成年/老年均使用正式外部网格。
- **人物调姿**：20 个 Humanoid 关节 FK、手脚两段式 IK、肘膝 Pole、世界空间手脚锁定、头部注视、人体关节极限、左右镜像、自定义姿势、姿势关键帧与 Undo/Redo。
- **姿势库**：站立、放松、立正、对话、叉腰、指向、警戒、半蹲、深蹲、坐姿、起立、跪姿、散步、左右步态、左右跑步、冲刺起跑、起跳/腾空/落地、持弓准备/拉弓满弦/释放、持物、拾取、推拉、拳脚等 35 组预设。
- **2D 导演视图**：站位图、真实摄影机水平 FOV、180°轴线、灯位，以及从真实摄影机几何生成的构图图；3D/2D/时间线共享同一 Shot 数据。
- **确定性 Editorial**：整数 Frame 为权威时间基，逐帧步进、帧量化播放、Marker/Note、真实 Dialogue/Music/SFX/Ambience 波形与 Web Audio 播放/离线混音。
- **参考输出与编辑交换**：浏览器可用编码器自动协商的 MP4 Director Reference、OpenTimelineIO 导入/导出与帧级 round-trip。
- **资产系统**：GLB 2.0 / FBX 诊断、FBX 来源单位显式确认、米制 1:1 规范化、IndexedDB 二进制缓存、Asset Registry、SHA-256、license 与 provenance。
- **协作与审片**：签名 Project Token、owner/director/editor/reviewer/viewer 权限、Presence、Shot/Object 租约锁、revision 冲突拒绝与权威回滚、不可变 Shot Version、帧级评论/批注、WIP → REVIEW → APPROVED 审批。
- **Pipeline Interoperability**：OpenUSD USDA、OCIO 2.5 / ACES 2.0、MaterialX 1.39、OTIO，以及 Blender/Maya/Houdini/Unreal/Nuke/Resolve 的确定性交接 manifest；StorageProvider 与媒体 Proxy 策略独立于 UI。
- **AI Production**：中英文脚本结构拆解；Pose/Depth/Lineart/Camera/Light/Humanoid Rig 控制分析；本地结构 Storyboard；通用 HTTPS `pds-http` Storyboard/Video 生成协议；整 Shot 结构控制序列；模型 Profile/Revision/参数快照；Prompt/Control/Source-Shot SHA-256；失败任务审计；生成媒体审批后才能进入 Asset Registry。
- **彻底中文化**：核心 14 个工作区使用中文界面，仅保留 USD、OTIO、OCIO、ACES、MaterialX、GLB/FBX、SHA-256、MP4、IK/FK、Pole 等必要行业术语。
- **Windows 一等支持**：Windows 11 与 Ubuntu 均在 GitHub Actions 执行完整门禁、回归测试和 production build；Chromium 另跑完整真实用户旅程与视觉审计。

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问 Vite 输出地址。`npm run dev` 会先安装并校验正式 CC0 人物资源，运行时不依赖第三方网站在线加载人物。

### Windows

Windows 11 可直接双击 `start-windows.cmd`，或在 PowerShell / CMD 中执行 npm 命令。CI 在 `windows-latest` 上真实执行完整测试/构建。详见 `docs/WINDOWS_SUPPORT.md`。

## 协作服务

启动服务端：

```bash
npm run collab:server
```

签发本地/测试 Project Token：

```bash
npm run collab:token -- <projectId> <userId> <role> <displayName>
```

生产部署必须配置自己的签名密钥、TLS/WSS 终止与身份签发流程。客户端以服务器 revision、权限和租约锁为权威。

## AI 推理接口

内置 `local-structural-v1` 无需外部模型即可生成结构 Storyboard。Studio 模型通过 `pds-http` Profile 接入；非 localhost Endpoint 必须使用 HTTPS，运行时 Bearer Token 不写入工程文件。协议见 `docs/PDS_AI_ENDPOINT.md`。

## Pipeline 标准基线

- OpenUSD target: `OpenUSD-26.08`
- OCIO: `2.5`
- ACES: `2.0`
- MaterialX document: `1.39`（library release metadata `1.39.5`）
- PDS coordinates: right-handed · Y-up · -Z forward · meter 1:1
- Editorial timebase: integer Frame / Shot FPS

Hosted CI 验证标准可见的交换结构和 PDS round-trip；不会把“未安装第三方商业/重量级 DCC”错误宣称为已完成应用内认证。参考边界见 `docs/GATE4_REFERENCE_APPLICATIONS.md`。

## 质量门禁

```bash
npm run check
```

完整门禁包括：

1. 静态工业合约审计
2. Windows 兼容审计
3. Collaboration/Auth 审计
4. Pipeline Interoperability 审计
5. AI Production 审计
6. 正式人物与 Humanoid Rig 审计
7. 中文界面审计
8. 3D 导演台实体器材/快捷操作审计
9. Vitest 回归测试
10. TypeScript + Vite production build
11. Chromium 真实用户旅程与视觉审计

PDS 1.1.1 候选版回归套件为 **85 tests / 18 test files**；最终交付要求 Windows + Ubuntu + Chromium 三路均通过。

## 架构原则

1. **3D 决定空间正确性，2D 负责导演表达，AI 不替代导演决策。**
2. **Frame 决定 Editorial 正确性。** 秒数是派生值，画面、声音、Marker、OTIO 与参考导出共享时基。
3. **Scene/Shot 数据优先于 UI。** 协作、Pipeline 与 AI 都围绕统一 Project → Sequence → Shot 合约工作。
4. **资产必须可追溯。** 稳定 ID、版本、license、SHA-256、单位、provenance 和规范 URI 是生产数据的一部分。
5. **多人协作首先保证权限、所有权、revision 和版本。** 实时共编不能以静默覆盖为代价。
6. **Approved 数据保持权威。** Review 版本不可变；AI 输出需要单独审批，不直接修改已批准导演数据。
7. **跨软件交换不靠猜测。** 坐标、色彩、时间基、材质和 adapter manifest 均显式记录。
8. **导演台优先直接操控。** 人物、摄影机、机位和灯具应能在 3D 场景直接辨识、点击和操作，列表仅作为辅助导航。
9. **每次交付通过 Windows + Ubuntu + Chromium 门禁。** 不用“本机能跑”替代跨平台与真实浏览器验收。

## Roadmap

`docs/ROADMAP.md` 中定义的 **Gate 0 → Gate 5 已全部完成**。PDS 1.1/1.1.1 属于 1.x 产品演进，聚焦正式人物、完整中文化、导演级 FK/IK 调姿和片场器材化 3D 操作。后续工作属于具体 Studio 部署、第三方 DCC 实机认证、性能/UX 优化与新增生产能力。
