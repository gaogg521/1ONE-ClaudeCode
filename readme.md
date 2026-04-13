<h1 align="center">1ONE ClaudeCode</h1>

<p align="center">
  <strong>Claude Code 可视化控制面板 · AI Agent 协作指挥台</strong><br>
  <em>免费开源 · 零门槛上手 · 支持任意模型 · 多 Agent 协作 · 远程访问 · 24/7 自动化</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-32CD32?style=flat-square" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-32CD32?style=flat-square" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6C757D?style=flat-square" alt="Platform">
  &nbsp;
  <img src="https://img.shields.io/badge/Electron-37-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  &nbsp;
  <img src="https://img.shields.io/badge/React-19.1-149ECA?style=flat-square&logo=react&logoColor=white" alt="React">
</p>

<p align="center">
  <a href="https://github.com/gaogg521/1ONE-Claude-Code/releases">
    <img src="https://img.shields.io/badge/⬇️%20立即下载-最新版本-32CD32?style=for-the-badge" alt="Download" height="45">
  </a>
  &nbsp;&nbsp;
  <a href="./docs/">
    <img src="https://img.shields.io/badge/📖%20使用文档-查看详情-0369a1?style=for-the-badge" alt="Docs" height="45">
  </a>
</p>

<div align="center">
  <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#22c55e;margin:0 4px;"></span>
  <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#06b6d4;margin:0 4px;"></span>
  <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#3b82f6;margin:0 4px;"></span>
  <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#f59e0b;margin:0 4px;"></span>
  <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#ef4444;margin:0 4px;"></span>
  <div style="margin-top:8px;font-size:12px;opacity:.8;">UI 主题强调：清爽高对比 · 绿色开关态 · 统一品牌高亮</div>
</div>

---

<details>
  <summary><strong>📋 目录（点击展开）</strong></summary>

- [为什么用它](#why)
- [快速开始](#quickstart)
  - [下载安装](#install)
  - [第一次使用（3 步上手）](#first-use)
  - [源码运行（开发者）](#dev)
- [功能概览](#features)
- [功能截图](#screenshots)
- [最近优化（稳定性与体验）](#recent-improvements)
- [配置与数据存储位置](#data-and-config)
- [常见问题（FAQ）](#faq)
- [技术栈](#tech-stack)
- [参与贡献](#contribute)
- [联系作者](#contact)

</details>

---

<a id="why"></a>
## 为什么用它

你可以把它理解成 **Claude Code / 多 Agent 的“可视化控制中心”**：

- **不止一个 Agent**：Claude / OpenClaw / Gemini CLI / Cursor 等按场景切换
- **不止一个模型**：支持任意 OpenAI-compatible / New-API / 自定义端点
- **不止一台设备**：WebUI 远程访问 + 统一设置入口
- **不止一次任务**：定时任务、Hook 监控、记忆中心，适合长期运行

<a id="features"></a>
## ✨ 功能概览

| 功能模块 | 说明 |
|---|---|
| 🧭 **统一入口（双视图）** | 一个入口聚合 Agent、模型、任务与扩展配置，支持总览与扩展视图快速切换 |
| 🤖 **多 Agent 管理** | Claude Code、OpenClaw、Gemini CLI、Cursor Agent 等并存管理，按场景灵活切换 |
| 🔧 **模型管理** | 图形化添加任意 API 模型，支持自定义端点、模型名与鉴权配置 |
| 🔌 **MCP 管理与一键接入** | 提供 MCP 状态监控与可视化接入流程，降低配置门槛并提升排障效率 |
| ⚡ **Hook 监控** | 可观测关键生命周期事件，便于构建通知、审计、自动化脚本链路 |
| 🛍️ **技能市场** | 支持按需安装社区技能包，快速扩展 Agent 的专业能力边界 |
| 👤 **自定义助手** | 创建专属助手角色，绑定提示词、技能与默认模型，沉淀团队工作流 |
| 🔎 **历史会话搜索** | 全量历史可检索可回溯，快速定位过往结论与上下文 |
| 🧠 **记忆中心** | 全局与项目记忆统一管理，跨会话保持上下文连续性 |
| 🌐 **远程访问 WebUI** | 支持多设备浏览器访问，便于远程查看与操作任务 |
| 💬 **通讯渠道控制** | 可对接 IM 渠道进行消息收发、触发任务与结果回传 |
| ⏰ **定时任务（Cron）** | 按计划自动触发 Agent 流程，满足巡检、日报和批处理场景 |
| 🎨 **主题切换** | 内置多套视觉主题，兼顾品牌表达与长期使用舒适度 |
| 🗂️ **工作空间管理** | 支持按工作空间组织项目和配置，实现多项目隔离协作 |
| 🌍 **开机启动与多语言** | 提供开机自启与多语言界面能力，适配国际化团队与长期运行场景 |

---

<a id="quickstart"></a>
## 🚀 快速开始

<a id="install"></a>
### 下载安装包（推荐）

前往 [Releases 页面](https://github.com/gaogg521/1ONE-Claude-Code/releases) 下载对应系统的安装包：

| 系统 | 文件格式 |
|---|---|
| Windows | `.exe` 安装包 / `.zip` 便携版 |
| macOS | `.dmg` 安装包 |
| Linux | `.deb` 安装包 |

<a id="first-use"></a>
### 第一次使用（3 步上手）

1. 打开应用后，点击左侧 **Agents** 选择你要使用的 AI Agent（推荐先用 **1ONE CODE**）
2. 进入左侧 **Models/模型**，添加你的 API Key / Base URL / 模型名
3. 回到 **新会话**，开始与 AI 对话（需要文件就上传/打开工作区）

<a id="dev"></a>
### 源码运行（开发者）

**环境要求：** Node.js >= 22、Git

> **关于 Bun（macOS 常见疑问）**：Bun **不是必须安装**。本项目本地 `postinstall` 会优先使用 `bunx`，若你的机器未安装 Bun，会自动回退到 `npx` 来执行 `electron-builder install-app-deps`，不影响安装依赖与启动。

```bash
# 克隆项目
git clone https://github.com/gaogg521/1ONE-Claude-Code.git
cd 1ONE-Claude-Code

# 安装依赖
npm install

# ⚠️ 重要：重新编译原生模块（针对 Electron，必须执行）
npx electron-rebuild -f -w better-sqlite3

# 启动开发模式
npm run restart
```

> **黑屏 / `NODE_MODULE_VERSION` 错误**：通常是 `better-sqlite3` 未按 Electron 版本重编译，执行 `npx electron-rebuild -f -w better-sqlite3` 后重启即可。

---

<a id="screenshots"></a>
## 🖼️ 功能截图

### 1. 统一入口（双图）

<p align="center">
  <img src="./resources/统一入口.png" alt="统一入口总览（新版）" width="90%">
</p>

<p align="center">
  <img src="./resources/统一入口2.png" alt="统一入口扩展视图" width="90%">
</p>

**图片说明：** 同一功能以双图展示，左图为你刚更新的统一入口新版截图，右图是扩展视图，突出统一调度与快速切换能力。

---

### 2. 多 Agent 管理

<p align="center">
  <img src="./resources/AGENT搭配.png" alt="多 Agent 管理" width="90%">
</p>

**图片说明：** 支持多 Agent 并存与自由启停，可按任务类型选择不同 Agent 协作。

---

### 3. 模型管理

<p align="center">
  <img src="./resources/模型添加1.png" alt="模型管理" width="90%">
</p>

**图片说明：** 图形化添加与管理模型配置，支持自定义 API 地址、模型名与鉴权信息。

---

### 4. MCP 服务管理（双图）

<p align="center">
  <img src="./resources/MCP监控.png" alt="MCP 服务总览" width="90%">
</p>

<p align="center">
  <img src="./resources/MCP监控1.png" alt="MCP 一键添加" width="90%">
</p>

**图片说明：** 同一功能双图展示：左图用于监控服务状态，右图用于演示服务接入流程。

---

### 5. Hook 监控

<p align="center">
  <img src="./resources/HOOK监控.png" alt="Hook 监控" width="90%">
</p>

**图片说明：** 对关键生命周期 Hook 进行监控，方便追踪自动化流程是否按预期执行。

---

### 6. 技能市场

<p align="center">
  <img src="./resources/技能.png" alt="技能市场" width="90%">
</p>

**图片说明：** 通过技能市场安装可复用能力模块，快速扩展 Agent 的任务边界。

---

### 7. 自定义助手

<p align="center">
  <img src="./resources/助手1.png" alt="自定义助手" width="90%">
</p>

**图片说明：** 支持创建专属助手角色，配置提示词、技能绑定和默认模型。

---

### 8. 历史会话搜索

<p align="center">
  <img src="./resources/历史会话搜索.png" alt="历史会话搜索" width="90%">
</p>

**图片说明：** 提供会话检索与历史定位能力，可快速回看关键上下文与结论。

---

### 9. 记忆中心

<p align="center">
  <img src="./resources/记忆.png" alt="记忆中心" width="90%">
</p>

**图片说明：** 统一管理全局与项目记忆，帮助 Agent 在跨会话场景下保持上下文连续。

---

### 10. 远程访问

<p align="center">
  <img src="./resources/远程访问.png" alt="远程访问" width="90%">
</p>

**图片说明：** 支持 WebUI 远程接入，让你在非本机设备上也能查看和操作任务。

---

### 11. 通讯渠道控制

<p align="center">
  <img src="./resources/通讯渠道控制2.png" alt="通讯渠道控制" width="90%">
</p>

**图片说明：** 支持将外部 IM 渠道接入工作流，实现消息通知、触发任务与结果回传。

---

### 12. 定时任务

<p align="center">
  <img src="./resources/定时任务2.png" alt="定时任务" width="90%">
</p>

**图片说明：** 使用 Cron 计划任务让 Agent 自动执行固定流程，适合巡检与日报场景。

---

### 13. 主题切换

<p align="center">
  <img src="./resources/主题切换.png" alt="主题切换" width="90%">
</p>

**图片说明：** 内置多套 UI 主题，可按偏好切换视觉风格并提升长时间使用体验。

---

### 14. 工作空间

<p align="center">
  <img src="./resources/工作空间.png" alt="工作空间" width="90%">
</p>

**图片说明：** 提供工作空间维度的组织与隔离能力，便于多项目并行管理。

---

### 15. 开机启动和多语言

<p align="center">
  <img src="./resources/开机启动和多语言.png" alt="开机启动和多语言" width="90%">
</p>

**图片说明：** 支持开机自启与多语言切换，满足跨地区团队和持续运行需求。

---

### 16. 一键添加各种使用 MCP

<p align="center">
  <img src="./resources/一键添加各种使用MCP.png" alt="一键添加各种使用 MCP" width="90%">
</p>

**图片说明：** 在统一流程中完成能力接入与配置联动，减少跨页面来回切换。

---

<a id="recent-improvements"></a>
## ✅ 最近优化（稳定性与体验）

下面这些是近期已经落地的体验优化（确保“开箱即用”，并减少新用户疑惑）：

- **设置默认打开 Agents**：进入设置后默认落到本地 Agents 页面，而不是 Gemini CLI。
- **新用户工作区空态更友好**：在 Workspace Hub 提供可执行的引导（去创建会话 / 项目设置）。
- **Agents 支持启用/禁用开关**：禁用的本地 Agent 不会出现在“新建会话”的 Agent 选择框里。
- **内置助手与源码同步**：源码删掉的内置助手，会自动从用户配置中清理，避免“幽灵助手”。
- **全局 Switch 开启态为绿色**：统一视觉语义（开启=绿色，减少误读）。
- **设置页切换更顺**：避免一次性挂载全部 Tab 内容，并在空闲时预加载常用设置页，降低首切卡顿。

---

<a id="data-and-config"></a>
## 📦 配置与数据存储位置

以下路径用于排查问题/备份数据（不同系统路径会略有差异）：

- **数据库（会话/消息/团队）**：`%APPDATA%\1OneClaudeCode-Dev\1one\1one.db`
- **配置（模型/MCP/Agents 等）**：`%APPDATA%\1OneClaudeCode-Dev\config\one-config.txt`（base64 编码 JSON）
- **开发模式锁文件**：`%APPDATA%\1OneClaudeCode-Dev\lockfile`

> 如果你启动后发现窗口/实例异常，优先用 `npm run restart`（它会清理 lockfile 并重启）。

---

<a id="faq"></a>
## ❓ 常见问题（FAQ）

**1）为什么设置页打开很早时，本地 Agents 可能短暂为空？**  
本地 Agent 识别是异步完成的，通常稍等片刻会自动出现；如果你刚启动就立刻打开设置，可能会看到短暂空列表。

**2）为什么我禁用了某个 Agent 后，新建会话里看不到它？**  
这是预期行为：禁用=不参与“新建会话”的候选列表，你可以随时在设置里重新开启。

**3）开发模式启动报 `NODE_MODULE_VERSION` / SQLite 相关错误？**  
执行一次：

```bash
npx electron-rebuild -f -w better-sqlite3
```

然后用：

```bash
npm run restart
```

**4）如何在浏览器远程访问 WebUI？**  
开发/本地模式可用 `npm run webui:prod` 启动 WebUI（默认 `localhost:25809`）。如需远程访问再使用带 `--remote` 的脚本（见 `package.json`）。

---

<a id="tech-stack"></a>
## 🛠️ 技术栈

| 层级 | 技术 |
|---|---|
| **桌面壳** | Electron 37 |
| **前端框架** | React 19.1 + TypeScript（strict） |
| **构建工具** | Vite 6 + electron-vite |
| **UI 组件** | Arco Design + UnoCSS |
| **终端集成** | node-pty + xterm.js |
| **本地存储** | SQLite (better-sqlite3) |
| **运行时** | Node.js（桌面端）；Bun（用于 CI/部分脚本与调试工具） |
| **协议支持** | MCP (Model Context Protocol) |

---

<a id="contribute"></a>
## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

- 🐛 **Bug 反馈**：[提交 Issue](https://github.com/gaogg521/1ONE-Claude-Code/issues)
- 💡 **功能建议**：[发起讨论](https://github.com/gaogg521/1ONE-Claude-Code/discussions)
- 📖 **版本发布**：[Releases](https://github.com/gaogg521/1ONE-Claude-Code/releases)

---

<a id="contact"></a>
## 📬 联系作者

有问题、想交流、或者想一起共建？欢迎通过以下方式联系：

<table align="center">
  <tr>
    <td align="center" width="300">
      <strong>💬 QQ 技术交流群</strong><br>
      <sub>oneclaw技术交流群 · 群号：2159069958</sub><br>
      <sub>欢迎进群交流产品使用、插件能力和自动化实践</sub>
      <br><br>
      <img src="./resources/QQ.png" alt="QQ群二维码" width="220">
    </td>
    <td align="center" width="50"></td>
    <td align="center" width="300">
      <strong>💚 微信</strong><br>
      <sub>Allen.赵 · 上海浦东</sub><br>
      <sub>可用于问题反馈、商务合作与生态共建沟通</sub>
      <br><br>
      <img src="./resources/微信.png" alt="微信二维码" width="220">
    </td>
  </tr>
</table>

---

<p align="center">
  <sub>Built by <a href="https://github.com/gaogg521">gaogg521</a> · Licensed under MIT</sub>
</p>
