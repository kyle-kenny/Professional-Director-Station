# Professional Director Station (PDS)

面向导演教学、影视前期制作与 AI 影视生产的数字导演工作台。

## 当前可运行能力

- **3D 导演台**：程序化标准演员库（男女 × 儿童/青少年/成年/老年）、真实米制坐标、摄影机焦段/光圈、导演视图与镜头视图、灯光预设。
- **2D 站位图**：人物站位、摄影机视锥、180°轴线、灯位，和 3D Shot 使用同一数据。
- **2D 构图图**：从真实 3D 摄影机投影生成人物结构画面，带三分线与 Action Safe。
- **时间线/声音骨架**：Camera / Blocking / Dialogue / Music / SFX / Ambience Track。
- **工程数据**：`Project → Sequence → Shot → Version`，Zod 运行时验证，可导入/导出 JSON。
- **工业约束**：右手坐标、Y-up、-Z forward、米制 1:1；Asset 元数据验证；CI 测试与构建。
- **协作边界**：Yjs 文档 + Transport 抽象，V1 提供 BroadcastChannel 同机协作骨架，为云端实时协作预留接口。

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

每次提交必须同时通过单元测试和 production build。

## 架构原则

1. **3D 决定空间正确性，2D 负责导演表达，AI 不替代导演决策。**
2. **Scene/Shot 数据优先于 UI。** 后续 USD、OTIO、OCIO、MaterialX、AI Video 都从统一 Shot 合约接入。
3. **资产不靠文件名猜测。** Asset 必须有稳定 ID、版本、授权、单位、规范 URI。
4. **多人协作首先保证版本和所有权。** 实时共编是能力，不是数据安全策略。
5. **每阶段都有验证门禁。** Schema、测试、构建、视觉回归和导出一致性逐步加入 CI。

## 下一阶段（P0）

- Transform Gizmo（移动/旋转/缩放）与对象选择系统
- 人物 Pose / Motion / Path 编辑器
- Camera Path、关键帧、Dolly/Pan/Tilt/Crane/Orbit 预设
- 灯具可视化 Gizmo 与阴影/曝光控制
- Asset Library + GLB/FBX 导入规范化
- IndexedDB 媒体缓存与音频波形
- Undo/Redo command stack
- Shot / Take / Version 历史和 Review 注释
- Playwright 视觉回归 + deterministic reference export

## 中期工业接口

- OpenUSD：场景/资产交换
- OpenTimelineIO：时间线/剪辑交换
- OCIO / ACES：色彩管理
- MaterialX：材质交换
- WebSocket/Yjs + 服务端权限：多人协作
- AI：Pose/Depth/Lineart/Camera motion 结构控制与下游视频生成

> 当前版本是“工业化底座 + 可运行导演工作流原型”，不是最终成片级 DCC。仓库应以严格版本门禁持续迭代，而不是一次性堆功能。
