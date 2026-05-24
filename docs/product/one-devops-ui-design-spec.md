# 1ONE AI-DevOps Engine: AI-Native Software Delivery Factory
## UI/UX Design Specification & Product Blueprint (B-Side Edition)

> **Document Version**: v1.0.0 (Stable)
> **Design Language Theme**: Industrial Rigorous B-Side (深邃靛蓝 `var(--ep-brand-8)` + 温暖琥珀金 `var(--ep-warning-5)`)
> **Core Concept**: Transitioning 1ONE Code from a personal AI assistant into an **Enterprise-Grade AI-Native Software Engineering Factory (AI-Native 软件交付工坊)**.

---

## 1. 产品形态与设计哲学 (Product Form & Philosophy)

1ONE AI-DevOps Engine 是一个**将 AI 协同（Agent Swarm）与标准 DevOps 全生命周期完美融合的 B 端生产力中枢**。

*   **设计基调（Design Archetype）**：严谨、安全、高效、高度工程化。摒弃消费级 AI 助手花哨、扁平、轻量的玩具感，采用**工业级严谨 B 端风格**（类似于 AWS 控制台、Datadog、腾讯蓝鲸的专业质感）。
*   **配色体系（Color Palette）**：
    *   **主色（Brand Color）**：深邃靛蓝 (`#1e3a8a` / `#1e1b4b`) —— 传递金融级的安全感、秩序感和稳重性。
    *   **辅助色（Accent Color）**：暖色琥珀金 (`#f59e0b` / `#d97706`) —— 用于高亮关键效能指标、质量红线警报、以及 AI 活跃执行状态。
    *   **背景色（Background）**：轻量级卡片式浅灰背景 (`#f8fafc` / `#f1f5f9`，非黑即白，干净利落）。
*   **布局逻辑（Layout Topology）**：
    *   **三层架构安全隔离**：个人工作台 ➔ 企业共享空间 ➔ 组织管理后台。
    *   **主页面架构**：左侧为企业级常驻侧边栏（导航流），顶部为高度统一的 Titlebar 与多端模式切换条（Mode Switcher），右侧为主操作视图与抽屉式 AI 实时分析预览面板（Preview Drawer）。

---

## 2. 系统技术架构与数据流 (Architecture & Data Flow)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        1ONE WEBUI / CLIENT (FE)                        │
│   (Vite + React + Arco Design + @icon-park/react + UnoCSS + Canvas)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (REST API / WebSocket - Port 25809)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       1ONE EXPRESS WEB SERVER (BE)                     │
│  - WebUI Auth / JWT / CSRF / Rate Limiters / Admin Elevation Guard     │
│  - Pipeline Exec Engine (child_process.spawn Runner + Log Streaming)    │
│  - Local RAG Engine (Transformers.js + ONNX Embedding models)          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ (Raw SQLite File - WAL Mode)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SQLITE DATABASE (v31)                           │
│  - Requirements Tree (Epic ➔ Story ➔ Task with recursive tracking)      │
│  - RAG Docs Metadata (chunk_count & indexing status)                   │
│  - Document Chunks (BLOB serialized Float32 embeddings)                │
│  - Pipelines & Pipeline Runs (definition JSON & execution logs)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心功能模块与 UI/UX 编排细则

### 3.1 CTeam 敏捷协同看板：智能需求分层
*   **需求描述**：提供从史诗（Epic）➔ 特性（Feature）➔ 用户故事（Story）➔ 开发任务（Task）的树状级联看板。支持 AI 智能需求拆解。
*   **UX 交互细节**：
    *   **看板视图**：传统的列式 Kanban 经过现代化改造，采用 Arco Design `Card` 和 `Tree` 结合。每一个 Epic 卡片下，支持点击展开“子特性/子故事”的嵌套折叠。
    *   **AI 自动拆单按钮**：卡片右上角高亮“琥珀金”AI 图标。点击后唤起 PM Agent 弹窗，AI 会在后台实时将大型业务需求分解为 3-5 个技术任务卡片，并在前端生成流畅的插入动画。
*   **UI 布局线框参考**：
    ```
    +-----------------------------------------------------------------------+
    | [ 敏捷看板 ]       (刷新) [ 智能拆解需求 ] (新建 Epic)  [ 搜索卡片... ]     |
    +-----------------------------------------------------------------------+
    | 需求池 (Backlog)      | 开发中 (Developing)   | 测试中 (Testing)      | 已完成 |
    |                       |                       |                      | (Done) |
    | +-------------------+ | +-------------------+ | +------------------+ |        |
    | | [Epic] 邮件重构   | | | [Story] 绑定LDAP  | | | [Bug] 403 异常   | | ...    |
    | | 关联子任务 (3) [v] | | | 指派: [AI-Coder]  | | | 指派: [何大鹏]   | |        |
    | | 优先级: [高]      | | | 进度: [=== 60%]   | | | 状态: [验证中]   | |        |
    | +-------------------+ | +-------------------+ | +------------------+ |        |
    +-----------------------------------------------------------------------+
    ```

### 3.2 RAG 离线语义知识库：企业的“大脑与规范”
*   **需求描述**：纯本地化、离线无需外网、不泄露隐私的 RAG 索引管理器。支持 PDF/MD 文档上传、滑动切片与实时向量检索测试。
*   **UX 交互细节**：
    *   **双栏设计**：左侧为文档管理器（列表、大小、切片进度条），右侧为 **“RAG 检索 Playground (测试沙盒)”**。
    *   ** Playground 交互**：管理员可以在测试框输入任何自然语言，点击“检索”，下方以卡片形式实时渲染数据库检索出的 Top-K 文本切片。右侧展示酷炫的 **“余弦相似度百分比分值 (e.g. 94.6% Match)”**。
*   **UI 布局线框参考**：
    ```
    +-----------------------------------------------------------------------+
    | 知识库文档管理                                | RAG 语义检索 Playground        |
    | (上传 PDF/MD/Docx)                            | +----------------------------+ |
    |                                               | | 输入测试问题...    [检索]   | |
    | +-------------------------------------------+ | +----------------------------+ |
    | | 文件名   | 大小 | 状态       | 切片数 | 操作  | |                              | |
    | |----------|------|------------|--------|-------| | [Card 1] 相似度: 94.6%        | |
    | | 规范.md  | 50KB | [completed]| 24     | (作废)| | Content: "公司前端代码统一..."| |
    | | PRD.pdf  | 2MB  | [indexing] | —      | —     | | 来自: 《前端开发规范.md》    | |
    | +-------------------------------------------+ | +----------------------------+ |
    +-----------------------------------------------------------------------+
    ```

### 3.3 MCP 统一服务仓库：AI 的“安全手臂”
*   **需求描述**：企业级集中化安全凭证管理、外接工具代理网关。
*   **UX 交互细节**：
    *   **工具连接器矩阵**：展示各种工具卡片（Jira, GitLab, PostgreSQL, AWS）。
    *   **高级凭证密码箱**：对 API Key、Token 字段进行脱敏展示。当后台已经配置过秘钥时，前端展示为密码形式的 `******`。修改时自动采用增量合并，管理员只需要点击“连通性一键测试”，前端即可显示由绿色 `icon` 构成的“连接就绪，提供 14 个 tools 接口”。

### 3.4 CCI 持续集成流水线：可视化编译与质量红线
*   **需求描述**：参考腾讯蓝鲸。可视化流水线 Stages（构建触发 ➔ 编译 ➔ 代码检查 ➔ 质量红线卡点 ➔ 部署），并能实时流式查看日志输出，具有 AI 自动报错自愈环路。
*   **UX 交互细节**：
    *   **流向拓扑图**：使用 SVG 绘制精美的横向 Stage 连接线。每个 Stage 内包含多个 Job 节点，Job 状态通过绿色（Success）、红色（Failed）、蓝色闪烁（Running）、灰色（Pending）直观呈现。
    *   **抽屉式日志控制台**：点击任何 Job，右侧弹出深黑背景的终端风格 Console 抽屉，通过 WebSocket 实时追加日志字符流（实时渲染 `stdout/stderr`），极具极客质感。
*   **UI 布局线框参考**：
    ```
    +-----------------------------------------------------------------------+
    | [流水线：1ONE-Main-Prod]         [执行历史]  [编辑配置]        (一键手动执行)   |
    +-----------------------------------------------------------------------+
    |  (1) 触发器     ➔     (2) 编译     ➔    (3) 代码检查   ➔    (4) 质量红线   |
    | +-------------+     +-------------+     +------------+     +------------+ |
    | | [v] 手动触发|     | [v] npm run |     | [x] oxlint |     | [!] 覆盖率 | |
    | | 耗时: 2s    |     | 耗时: 12s   |     | 耗时: 4s   |     | 限制 >80%  | |
    | +-------------+     +-------------+     +------------+     +------------+ |
    |                      (正在执行...)          (报错暂停)       (自愈中...)  |
    +-----------------------------------------------------------------------+
    ```

### 3.5 CMeas & CFlow：价值流与效能度量大屏（ROI 观测）
*   **需求描述**：面向 CXO/企业管理者的数字化转型可视化大屏。展示 AI 引入后带来的真正效能提升。
*   **UX 交互细节**：
    *   **CFlow 价值流分析**：横向流动图（需求阶段 ➔ 开发阶段 ➔ 测试阶段 ➔ 准生产阶段 ➔ 发布阶段），柱状图显示每个阶段的“等待时间”与“活跃编写时间”。
    *   **CMeas 度量指标**：
        1.  **AI 代码行数占比**（圆环图）。
        2.  **需求交付周期缩短比率**（对比折线图）。
        3.  **缺陷密度燃尽图**（燃尽折线图）。
    *   **视觉效果**：高对比度的图表，深邃底色，琥珀金指针，支持一键导出包含 AI 效能诊断建议的 PDF 报告。

---

## 4. UI 框架规范与快速导入 AI 指示 (For v0/Cursor/Anysphere)

当您将此规范发给 **v0.dev** 或其它 UI 生成 AI 时，请附带以下 Prompt 说明，以获得最完美的 UI 渲染效果：

### 📥 快速输入给 UI 生成 AI 的 Prompt 模板：
```markdown
Please generate a gorgeous, high-fidelity React UI mockup for "1ONE AI-DevOps Console" based on the attached markdown specification.

Design requirements:
1. Framework: Tailwind CSS + Radix UI / Arco Design inspired components.
2. Tone & Palette: Rigorous enterprise-grade B-side layout. Dark Indigo (#1e1b4b) as brand primary color, warm Amber/Gold (#f59e0b) for active AI runs/alerts/metrics, light slate-gray (#f8fafc) card-based clean background.
3. Typography: Tight margins, small text size (text-13px / text-12px for meta-data) with highly dense information display, clean grids (no unnecessary whitespaces, resembling AWS Console / Datadog).
4. Component Layouts:
   - Left: 常驻侧栏 Sidebar with custom enterprise navigation items.
   - Top: Clean header indicating "Enterprise Console" with elevation verification badge status.
   - Main: A dashboard showing:
     a) CTeam Agile card tree (collapsible epic columns with dragging cards).
     b) RAG Knowledge Base split panel (file management table on the left, Playground semantic search playground on the right with scored results of matched chunk cards).
     c) CCI Pipeline Topology flow (interactive node-based vertical/horizontal stages with status colors and an overlaying UNIX-style streaming logs terminal console drawer).
     d) CMeas/CFlow analytics charts (value-stream latency, AI code contribution donut chart, and sprint burn-down charts).

Make it incredibly professional, pixel-perfect, and rich in realistic mock-data.
```
