# Professional Director Station (PDS)

面向导演教学、影视前期制作、多人 Review、Pipeline 交换与可追溯 AI 影视生产的数字导演工作台。

## PDS 1.0 能力

- **3D 导演台**：标准演员库（男/女 × 儿童/青少年/成年/老年）、真实米制坐标、Pose/Motion、Transform Gizmo、人物/摄影机/灯光关键帧、焦段/机位预设、曝光与阴影。
- **2D 导演视图**：站位图、摄影机视锥、180°轴线、灯位，以及从真实摄影机几何生成的构图图；3D/2D/时间线共享同一 Shot 数据。
- **确定性 Editorial**：整数 Frame 为权威时间基，逐帧步进、帧量化播放、Marker/Note、真实 Dialogue/Music/SFX/Ambience 波形与 Web Audio 播放/离线混音。
- **参考输出与编辑交换**：H.264/AVC + AAC MP4 Director Reference，OpenTimelineIO 导入/导出与帧级 round-trip。
- **资产系统**：GLB 2.0 / FBX 诊断、FBX 来源单位显式确认、米制 1:1 规范化、IndexedDB 二进制缓存、Asset Registry、SHA-256、license 与 provenance。
- **协作与审片**：签名 Project Token、owner/director/editor/reviewer/viewer 权限、Presence、Shot/Object 租约锁、revision 冲突拒绝与权威回滚、不可变 Shot Version、帧级评论/批注、WIP → REVIEW → APPROVED 审批。
- **Pipeline Interoperability**：OpenUSD USDA、OCIO 2.5 / ACES 2.0、MaterialX 1.39、OTIO，以及 Blender/Maya/Houdini/Unreal/Nuke/Resolve 的确定性交接 manifest；StorageProvider 与媒体 Proxy 策略独立于 UI。
- **AI Production**：中英文脚本结构拆解；Pose/Depth/Lineart/Camera/Light 控制分析；本地结构 Storyboard；通用 HTTPS `pds-http` Storyboard/Video 生成协议；整 Shot 结构控制序列；模型 Profile/Revision/参数快照；Prompt/Control/Source-Shot SHA-256；失败任务审计；生成媒体审批后才能进入 Asset Registry。
- **导演数据优先**：AI 生成是附加产物，不会自动修改或覆盖 Approved Shot。导演审批状态和不可变版本保持权威。
- **Windows 一等支持**：Windows 11 与 Ubuntu 均在 GitHub Actions 执行完整门禁、回归测试和 production build。

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问 Vite 输出地址。

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
6. Vitest 回归测试
7. TypeScript + Vite production build

Gate 5 合并时的回归套件为 **56 tests / 14 test files**，并在 Windows + Ubuntu 双平台通过。

## 架构原则

1. **3D 决定空间正确性，2D 负责导演表达，AI 不替代导演决策。**
2. **Frame 决定 Editorial 正确性。** 秒数是派生值，画面、声音、Marker、OTIO 与参考导出共享时基。
3. **Scene/Shot 数据优先于 UI。** 协作、Pipeline 与 AI 都围绕统一 Project → Sequence → Shot 合约工作。
4. **资产必须可追溯。** 稳定 ID、版本、license、SHA-256、单位、provenance 和规范 URI 是生产数据的一部分。
5. **多人协作首先保证权限、所有权、revision 和版本。** 实时共编不能以静默覆盖为代价。
6. **Approved 数据保持权威。** Review 版本不可变；AI 输出需要单独审批，不直接修改已批准导演数据。
7. **跨软件交换不靠猜测。** 坐标、色彩、时间基、材质和 adapter manifest 均显式记录。
8. **每次交付通过 Windows + Ubuntu 门禁。** 不用“本机能跑”替代跨平台验收。

## Roadmap

`docs/ROADMAP.md` 中定义的 **Gate 0 → Gate 5 已全部完成**。后续工作属于 1.x 产品演进、具体 Studio 部署、第三方 DCC 实机认证、性能/UX 优化与新增生产能力。
