# Professional Director Station (PDS)

面向导演教学、影视前期制作与 AI 影视生产的数字导演工作台。

## 当前可运行能力

- **3D 导演台**：程序化标准演员库（男女 × 儿童/青少年/成年/老年）、真实米制坐标、Pose/Motion、摄影机与灯具关键帧、焦段/机位预设、曝光和阴影控制。
- **2D 站位图**：人物站位、摄影机视锥、180°轴线、灯位，和 3D Shot 使用同一时间点数据。
- **2D 构图图**：从真实 3D 摄影机投影生成人物结构画面，带三分线与 Action Safe；与 MP4 参考导出共享同一逐帧渲染器。
- **确定性 Editorial 时间线**：整数 Frame 为权威时间基，支持逐帧步进、帧量化播放、人物/摄影机/灯光 Key、Marker 和导演 Note。
- **真实声音工作流**：Dialogue / Music / SFX / Ambience 可导入真实音频，Web Audio 解码，IndexedDB 本地媒体缓存，波形显示、起点/时长整帧编辑、Gain、播放和离线 Mixdown。
- **Editorial 交换与参考输出**：OpenTimelineIO 导入/导出；通过 Mediabunny + WebCodecs 输出 H.264/AVC + AAC 的 MP4 Director Reference。
- **资产导入**：GLB 2.0 / FBX 诊断、FBX 来源单位显式确认、米制 1:1 规范化、Asset Registry 与 IndexedDB 原始二进制缓存。
- **工程数据**：`Project → Sequence → Shot → Version`，Zod 运行时验证，可导入/导出 JSON，工程修改进入统一 Undo/Redo 历史。
- **工业约束**：右手坐标、Y-up、-Z forward、米制 1:1；Windows 11 一等支持；Windows + Ubuntu CI 同时执行静态门禁、回归测试和 production build。
- **协作边界**：Yjs 文档 + Transport 抽象，当前提供 BroadcastChannel 同机协作骨架，为 Gate 3 的服务端权限与实时协作预留接口。

## 本地运行

```bash
npm install
npm run dev
```

浏览器访问 Vite 输出地址。

### Windows

Windows 11 是一等支持平台。开发版可直接双击 `start-windows.cmd`，或在 PowerShell / CMD 中执行上述 npm 命令。CI 会在 `windows-latest` 实际执行静态门禁、单测与 production build。详见 `docs/WINDOWS_SUPPORT.md`。

## 标准演员库

内置 8 类不依赖第三方授权的导演灰盒演员：男童、女童、少年、少女、成年男、成年女、老年男、老年女。角色包含真实导演所需的身高、眼高、肩宽、体深、头部比例和年龄姿态数据。详见 `docs/CHARACTER_LIBRARY.md`。

## 质量门禁

```bash
npm run check
```

每次提交必须通过静态工业审计、Windows 兼容审计、单元/回归测试和 production build。Gate 2 已覆盖确定性时间轴、波形、OTIO round-trip、MP4 帧计划以及旧工程兼容测试；当前回归套件共 35 项。

## 架构原则

1. **3D 决定空间正确性，2D 负责导演表达，AI 不替代导演决策。**
2. **Frame 决定 Editorial 正确性。** 秒数是 `frame / fps` 的派生值，画面、声音、Marker、OTIO 与参考导出共享同一时基。
3. **Scene/Shot 数据优先于 UI。** 后续 USD、OCIO、MaterialX、AI Video 都从统一 Shot 合约接入。
4. **资产不靠文件名猜测。** Asset 必须有稳定 ID、版本、授权、单位、规范 URI。
5. **多人协作首先保证版本和所有权。** 实时共编是能力，不是数据安全策略。
6. **每阶段都有验证门禁。** Schema、测试、构建、导出一致性和跨平台验证逐步加入 CI。

## 下一阶段（Gate 3）

- authenticated projects、角色与权限
- presence、对象所有权与 Shot locks
- immutable versions、评论与帧级批注
- WIP / Review / Approved 审批闭环
- Asset Registry checksum / provenance / license metadata
- 多人冲突、断线恢复与 rollback 测试

## 后续工业接口

- OpenUSD：场景/资产交换
- OCIO / ACES：色彩管理
- MaterialX：材质交换
- DCC/editor adapters
- 服务端 WebSocket/Yjs 与权限层
- AI：Pose/Depth/Lineart/Camera motion 结构控制与下游视频生成

> Gate 0、Gate 1、Gate 2 已完成并通过 Windows + Ubuntu 双平台 CI；下一阶段为 Gate 3 协作与 Review 工业化。仓库以严格版本门禁持续迭代，而不是一次性堆功能。
